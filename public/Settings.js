

function toggleTheme() {
    document.body.classList.toggle("dark");
    const isDark = document.body.classList.contains("dark");
    localStorage.setItem("theme", isDark ? "dark" : "light");
    
    // Optionnel : Changer l'icône du bouton si tu en as un (Lune/Soleil)
    const btnIcon = document.querySelector("#themeBtn i");
    if(btnIcon) {
        btnIcon.className = isDark ? "fas fa-sun" : "fas fa-moon";
    }
}


function logout(){

localStorage.removeItem("userId");

window.location.href = "login.html";

}