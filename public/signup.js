const form = document.getElementById("signupForm");

form.addEventListener("submit", async (e) => {

e.preventDefault();

const username = document.getElementById("username").value;
const email = document.getElementById("email").value;
const password = document.getElementById("password").value;
const confirmPassword = document.getElementById("confirmPassword").value;

if(password !== confirmPassword){
alert("Les mots de passe ne correspondent pas");
return;
}

const res = await fetch("/signup", {
method: "POST",
headers: {
"Content-Type": "application/json"
},
body: JSON.stringify({
username,
email,
password
})
});

const data = await res.json();

if(data.success){
alert("Compte créé avec succès !");
window.location.href = "login.html";
}else{
alert(data.message);
}

});