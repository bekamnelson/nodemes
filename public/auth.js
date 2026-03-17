const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const formBoxes = document.querySelectorAll(".form-box");
const showSignup = document.getElementById("showSignup");
const showLogin = document.getElementById("showLogin");

// Bascule vers l'inscription
showSignup.addEventListener("click", () => {
    formBoxes[0].style.display = "none";
    formBoxes[1].style.display = "block";
});

// Bascule vers la connexion
showLogin.addEventListener("click", () => {
    formBoxes[1].style.display = "none";
    formBoxes[0].style.display = "block";
});

// Exemple simple : envoyer les données au serveur
loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const username = document.getElementById("loginUsername").value;
    const password = document.getElementById("loginPassword").value;

    fetch("/login", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({username,password})
    }).then(res => res.json()).then(data => {
        if(data.success){
            window.location.href = "/chat.html"; // redirige vers le chat
        } else alert(data.message);
    });
});

signupForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const username = document.getElementById("signupUsername").value;
    const password = document.getElementById("signupPassword").value;

    fetch("/signup", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({username,password})
    }).then(res => res.json()).then(data => {
        if(data.success){
            alert("Inscription réussie ! Connectez-vous.");
            formBoxes[1].style.display = "none";
            formBoxes[0].style.display = "block";
        } else alert(data.message);
    });
});