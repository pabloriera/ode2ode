const slider = document.createElement('input');
slider.setAttribute('type', 'range');
slider.setAttribute('id', 'slider');
slider.setAttribute('min', '0');
slider.setAttribute('max', '100');
slider.setAttribute('value', '50');
const container = document.querySelector('.container');
container.appendChild(slider);