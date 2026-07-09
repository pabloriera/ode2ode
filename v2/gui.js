let gui = new dat.GUI();

function addPlayPauseButton(mainguiconfig, audioContext) {
    let mainFolder = gui.addFolder('Sim');
    mainFolder.add(mainguiconfig, 'play').name('Play').onChange(() => {
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        } else {
            audioContext.suspend();
        }
    });
}

function createOdeGui(odeConfig, updateParameters) {
    let folder = gui.addFolder(odeConfig.name);

    for (let parameter in odeConfig.gui_parameters) {
        let value = odeConfig.gui_parameters[parameter];
        let range = odeConfig.parameters[parameter];
        let step = (range.max - range.min) / 100;

        folder.add(odeConfig.gui_parameters, parameter)
            .min(range.min)
            .max(range.max)
            .step(step > 0 ? step : 0.01)
            .onChange(updateParameters);
    }

    folder.add(odeConfig, 'gain').min(0).max(1).step(0.01).onChange(updateParameters);
    folder.add(odeConfig, 'resetInitialConditions');
    folder.add(odeConfig, 'detuning').min(-1).max(2).step(0.001).onChange(updateParameters);
    return folder;
}

function addMainVolumeControl(mainguiconfig, audioMixer, onChange) {
    let mainFolder = gui.addFolder('Main');
    mainFolder.add(mainguiconfig, 'mainVolume', 0, 1, 0.01)
        .name('Main Volume')
        .onChange(() => {
            audioMixer.setMainVolume(mainguiconfig.mainVolume);
            onChange?.();
        });

    return mainFolder;
}

function removeFolder(folder) {
    if (!folder) {
        return;
    }

    const parent = folder.parent ?? gui;

    if (typeof parent.removeFolder === 'function' && parent.removeFolder !== removeFolder) {
        parent.removeFolder(folder);
        return;
    }

    folder.close?.();

    if (folder.domElement?.parentNode) {
        folder.domElement.parentNode.removeChild(folder.domElement);
    }

    if (folder.name && parent.__folders?.[folder.name]) {
        delete parent.__folders[folder.name];
    }

    parent.onResize?.();
}

export { addMainVolumeControl, addPlayPauseButton, createOdeGui, removeFolder };
