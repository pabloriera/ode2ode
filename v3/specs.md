# Modular synth based on ODEs

VCV Rack layout imitation
You can add modules that solve a specific ODE (Lorenz, Hopf normal form, Duffing osc, VdP osc, Hirshmare-Rose model, etc)
The modules can be connected, output from one system can be used as input of another system. A gain knob in each input allow to scale signal. Each module has a visualization option of the sound. Revisit old version to check que visualization options.

# ODE integration

We need to revisit old version and check the status of this part. The idea was that each ODE is integrated at some frequency (n*sampling_rate) and a web audio worklet goes along this integration and emits at sampling_rate the audio signal. One signal per dynamical variable in ODE definition. It may be in a earlier stage of development
