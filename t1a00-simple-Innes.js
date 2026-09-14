// 1. Create a new Audio object with the path to your sound file
const clickSound = new Audio('b-bigshot-spamton.mp3'); // Replace with your file URL or path

// 2. Select the button element
const button = document.getElementById('soundButton');

// 3. Add a click event listener to play the sound
button.addEventListener('click', () => {
    // Reset sound to start if clicked rapidly
    clickSound.currentTime = 0; 
    clickSound.play();
});
