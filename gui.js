//Use dat.gui to control the parameters
let gui = new dat.GUI();

//Add play/pause button to gui
function addPlayPauseButton(mainguiconfig, audioContext) {
    //main folder
    let mainFolder = gui.addFolder('Sim');
    mainFolder.add(mainguiconfig, 'play').name('Play').onChange(() => {
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        } else {
            audioContext.suspend();
        }
    });
}

//create function that receives a ode config object and creates a gui folder with the name and include the parameters and gain      
//add a button to reset the parameters to their initial values
//add a button to change visualization type
function createOdeGui(odeConfig, updateParameters, resetInitialConditions) {
    let folder = gui.addFolder(odeConfig.name);
    for (let parameter in odeConfig.parameters) {
        folder.add(odeConfig.parameters, parameter).min(0).max(1000).step(0.1).onChange(updateParameters);
    }
    folder.add(odeConfig, 'gain').min(0).max(1).step(0.01).onChange(updateParameters);
    folder.add(odeConfig, 'resetInitialConditions').onChange(resetInitialConditions);
    return folder;
}

export { createOdeGui, addPlayPauseButton };