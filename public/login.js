const form = document.getElementById("loginForm");

form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    try {
        const res = await fetch("/login",{
            method:"POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });

        const data = await res.json();

        if(data.success){
            // ✅ vérifier que data.user existe
            if(data.user && data.user._id){
                localStorage.setItem("userId", data.user._id);
            }
          
            alert("Connexion réussie");
            window.location.href = "chat.html";
        } else {
            alert(data.message);
        }

    } catch(err){
        console.log(err);
        alert("Erreur serveur");
    }

});