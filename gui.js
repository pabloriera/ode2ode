const debug = true;
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
    if (debug) console.log("Parameters:", odeConfig.gui_parameters);
    for (let parameter in odeConfig.gui_parameters) {
        let value = odeConfig.gui_parameters[parameter];
        let range = odeConfig.parameters[parameter];
        if (Array.isArray(range)) {
            // If parameter is array [value, min, max], use those values
            folder.add(odeConfig.gui_parameters, parameter)
                .min(range[1])
                .max(range[2])
                .step((range[2] - range[1]) / 100)
                .onChange(updateParameters);
        } else {
            // If parameter is single value, use default range
            folder.add(odeConfig.gui_parameters, parameter)
                .min(value * 0.25)
                .max(value * 4)
                .step(value * 0.01)
                .onChange(updateParameters);
        }
    }
    folder.add(odeConfig, 'gain').min(0).max(1).step(0.01).onChange(updateParameters);
    folder.add(odeConfig, 'resetInitialConditions').onChange(resetInitialConditions);
    folder.add(odeConfig, 'detuning').min(-1).max(2).step(0.001).onChange(updateParameters);
    return folder;
}

function addMainVolumeControl(mainguiconfig, audioMixer) {
    let mainFolder = gui.addFolder('Main');
    mainFolder.add(mainguiconfig, 'mainVolume', 0, 1, 0.01)
        .name('Main Volume')
        .onChange(() => {
            audioMixer.setMainVolume(mainguiconfig.mainVolume);
        });

    return mainFolder;
}

//remove folder from gui
function removeFolder(folder) {
    gui.removeFolder(folder);
}


export { createOdeGui, addPlayPauseButton, addMainVolumeControl, removeFolder };