//Use dat.gui to control the parameters
let gui = new dat.GUI();

//create function that receives a ode config object and creates a gui folder with the name and include the parameters and gain      
function createOdeGui(odeConfig, updateParameters) {
    let folder = gui.addFolder(odeConfig.name);
    for (let parameter in odeConfig.parameters) {
        folder.add(odeConfig.parameters, parameter).min(0).max(1000).step(0.1).onChange(updateParameters);
    }
    folder.add(odeConfig, 'gain').min(0).max(1).step(0.01).onChange(updateParameters);
}

export { createOdeGui };