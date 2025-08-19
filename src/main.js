import * as THREE from "three/webgpu";
import { FontLoader, OrbitControls, RoomEnvironment, TextGeometry } from "three/examples/jsm/Addons.js";
import { instancedBufferAttribute, float,color,uv,metalness,hue,length,step,mix,vec3,positionLocal,roughness, storage, attribute, Fn, instanceIndex, mx_noise_vec3, time, uniform, rotate, mx_noise_float, transmission, dispersion, ior, instancedArray, thickness, sheen, iridescence, smoothstep, blur, oneMinus, sub, pass, mrt, output, normalView, vec4, floor, mod, sin, emissive } from "three/tsl";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import { ao } from "three/examples/jsm/tsl/display/GTAONode.js";
import { denoise } from "three/examples/jsm/tsl/display/DenoiseNode.js";
import * as dat from "dat.gui";

/******************/
//  TSL Cubes
//  @loloarmdz
//  nuevosmiedos.xyz
/******************/

const Resources = {
    font:undefined    
}

function preload()
{

    init();

}

function init()
{
    
    //  Scene setup
   const sizes = {
        width: window.innerWidth,
        height: window.innerHeight
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, sizes.width / sizes.height, 0.1, 100);
    const renderer = new THREE.WebGPURenderer({ antialias: true, canvas:document.getElementById("canvas") });
    renderer.toneMapping = THREE.CineonToneMapping;
    renderer.toneMappingExposure = 0.5;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.body.appendChild(renderer.domElement);

    renderer.setSize(sizes.width, sizes.height);
    camera.position.z = 5.0;

    scene.add(camera);

    scene.background = new THREE.Color("#1b1619");

    const environment = new RoomEnvironment();
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromSceneAsync(environment).texture;

    scene.environmentIntensity = 0.8;

    const   light = new THREE.DirectionalLight("#e7e2ca",5);
    light.position.x = 0.0;
    light.position.y = 1.2,
    light.position.z = 3.86;

    scene.add(light);

    //  


    const controls = new OrbitControls(camera,renderer.domElement)
    controls.enabled = false;

    const lado = 10;
    const master_cube_size = 2.0;
      
    const   params = {
        cube_color:"#494949",
        emissive_color:"#ad2358"
    }

    const   defitinion = {
        width:2,
        height:4,
        x:18,
        y:35,
        z:20
    };

    //  cube matrix position initialization 

    const positions = [];
    for(var d=0;d<defitinion.z;d++)
    {
        const _geo = new THREE.PlaneGeometry(defitinion.width,defitinion.height,defitinion.x,defitinion.y);
        const _d = ((d/(defitinion.z-1))*2.0-1.0)*.5*master_cube_size;
        _geo.translate(0.0,0.0,_d);
        const _pos = _geo.attributes.position.array;
        _pos.map((_p)=>{
            positions.push(_p);
        });
    }

    const count = Math.floor(positions.length/3);
    
    const    initial_position_buffer = storage(new THREE.InstancedBufferAttribute(new Float32Array(positions),3),"vec3",count);
    const    position_buffer = instancedArray(count,"vec3");
    const    properties_buffer = instancedArray(count,"vec3");


    //  mesh 

    const instance = new THREE.InstancedMesh(new THREE.BoxGeometry(.1,.1,.1),new THREE.MeshStandardNodeMaterial({
        color:new THREE.Color(params.cube_color),
        metalness:0.5,
        roughness:.7
    }),count);
    instance.castShadow = true;
    instance.receiveShadow = true
    

    //  compute

    const u_offset_noise = uniform(0.0);
    const u_cube_color = uniform(new THREE.Color(params.cube_color));
    const u_emissive_cube_color = uniform(new THREE.Color(params.emissive_color));

    const   init_buffer = Fn(()=>{
        
        const current_position = position_buffer.element(instanceIndex);
        current_position.assign(initial_position_buffer.element(instanceIndex));
        
        const prop = properties_buffer.element(instanceIndex);
        const noise = mx_noise_vec3(current_position,2.0);
        prop.x = noise.x.mul(0.5).add(0.5);

    })().compute(count);
    renderer.computeAsync(init_buffer);

    const   update_buffer = Fn(()=>{

        const p = position_buffer.element(instanceIndex);
        const prop = properties_buffer.element(instanceIndex);

        const noise = mx_noise_vec3(vec3(p.x,p.y,p.z).add(vec3(0.0,u_offset_noise,0.0)),2.0);
        const d_x = step(noise.x.mul(0.5).add(0.5),.3);
        const d_y = step(noise.y.mul(0.5).add(0.5),0.2);
        const d_z = noise.y.mul(0.5).add(0.5);

        prop.x = prop.x.add((d_x.sub(prop.x)).mul(0.05));
        prop.y = prop.y.add((d_y.sub(prop.y)).mul(0.03));
        prop.z = prop.z.add((d_z.sub(prop.z)).mul(0.03));


    })().compute(count);

    //  set material
    const position_at = position_buffer.toAttribute();
    const properties_att = properties_buffer.toAttribute();
    const instance_scale = properties_att.x;

    const scaled_position = positionLocal.mul(instance_scale).add(position_at);
    const offset_y = position_at.y.mul(0.9)

    const rotation_vec = vec3(0.0,(((offset_y).add(u_offset_noise).mul(0.5)).mul(Math.PI*.1)),0.0);
    const final_position = rotate(scaled_position,rotation_vec);

    instance.material.positionNode = final_position;
    instance.material.colorNode = u_cube_color;

    const mixer = step(0.5,sin(u_offset_noise.add(offset_y.mul(2.0)).mul(0.5).add(0.5)));
    instance.material.emissiveNode = u_emissive_cube_color.mul(properties_att.y).mul(float(5.0).add(mixer.mul(20.0)));
  
    scene.add(instance)

    //  interaction

    function isMobile() {
        const regex = /Mobi|Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
        return regex.test(navigator.userAgent);
    }
    const desktop = isMobile() === false;
    
    const cursor = {}
    cursor.x = 0
    cursor.y = 0
    cursor.dy = 0.0;

    window.addEventListener('pointerdown', (event) =>
    {
        if(desktop && event.pressure > 0.0 || desktop === false){
            cursor.x = event.clientX / sizes.width - 0.5
            cursor.y = event.clientY / sizes.height - 0.5
            cursor.dy = 0.0;
        }
        
    });

    window.addEventListener('pointerexit', (event) =>{
            
        cursor.x = event.clientX / sizes.width - 0.5
        cursor.y = event.clientY / sizes.height - 0.5
        cursor.dy = 0.0;

    });

    const amp = sizes.width > sizes.height ? sizes.width/sizes.height : sizes.height/sizes.width;
    window.addEventListener('pointermove', (event) =>
    {
        event.preventDefault();
        if(desktop && event.pressure > 0.0 || desktop === false){
            cursor.x = event.clientX / sizes.width - 0.5
            let ny =  event.clientY / sizes.height - 0.5
            cursor.dy += (ny-cursor.y)*amp*(isMobile ? 0.1 : .01);
            cursor.y = ny;
        }
    },{ passive: false })

    // Post Processing

    const   composer = new THREE.PostProcessing(renderer);
    const   scene_pass = pass(scene,camera);

    scene_pass.setMRT(mrt({
        output:output,
        normal:normalView
    }));

    const   scene_color = scene_pass.getTextureNode("output");
    const   scene_depth = scene_pass.getTextureNode("depth");
    const   scene_normal = scene_pass.getTextureNode("normal");

    const ao_pass = ao( scene_depth, scene_normal, camera);
    ao_pass.resolutionScale = 1.0;

    const   ao_denoise = denoise(ao_pass.getTextureNode(), scene_depth, scene_normal, camera ).mul(scene_color);
    const   bloom_pass = bloom(ao_denoise,0.5,0.2,0.1);
    const   post_noise = (mx_noise_float(vec3(uv(),time.mul(0.1)).mul(sizes.width),0.03)).mul(1.0);

    composer.outputNode = ao_denoise.add(bloom_pass).add(post_noise);

    //  ui

    const gui = new dat.GUI();
    gui.addColor(params,"cube_color").name("Cube Color").onChange((v)=>u_cube_color.value=new THREE.Color(v));
    gui.addColor(params,"emissive_color").name("Emissive Color").onChange((v)=>u_emissive_cube_color.value=new THREE.Color(v));


    //  Renderer loop

    renderer.setAnimationLoop(animate);
    function animate() { 

        u_offset_noise.value+=cursor.dy*.2;
        renderer.computeAsync(update_buffer);
        composer.renderAsync();
    }

    window.addEventListener("resize", () => {
        sizes.width = window.innerWidth;
        sizes.height = window.innerHeight;

        camera.aspect = sizes.width / sizes.height;
        camera.updateProjectionMatrix();

        renderer.setSize(sizes.width, sizes.height);
    });


}

window.onload = preload;