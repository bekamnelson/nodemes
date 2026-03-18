const userId = localStorage.getItem("userId");

// charger infos
async function loadProfile(){

const res = await fetch("/user/" + userId);
const data = await res.json();

document.getElementById("username").value = data.user.username;
document.getElementById("email").value = data.user.email;

document.getElementById("profileImg").src = data.user.profilePic;

}

loadProfile();
async function updateProfile(){

const username = document.getElementById("username").value;
const email = document.getElementById("email").value;

await fetch("/updateProfile",{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({
userId,
username,
email
})
});

alert("Profil mis à jour");

}
document.getElementById("imageInput").addEventListener("change", async () => {

const file = document.getElementById("imageInput").files[0];

const formData = new FormData();
formData.append("image", file);
formData.append("userId", userId);

const res = await fetch("/uploadProfilePic",{
method:"POST",
body: formData
});

const data = await res.json();

if(data.success){
document.getElementById("profileImg").src = data.imageUrl;
}

});