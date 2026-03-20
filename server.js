const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");
const multer = require("multer");
const path = require("path");
require('dotenv').config(); 

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" } 
});

// --- 1. MIDDLEWARES ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// --- 2. CONNEXION MONGODB ---

// Utilise l'URI de l'environnement (en ligne) ou le local si rien n'est défini
const mongoURI = process.env.MONGO_URI || "mongodb+srv://nelson:a4gb5ui6@cluster0.uvjq8jz.mongodb.net/?appName=Cluster0";
const PORT = process.env.PORT || 3000;

// Connexion MongoDB
mongoose.connect(mongoURI)
  .then(() => console.log(`✅ Connecté à MongoDB (${process.env.NODE_ENV || 'production'})`))
  .catch(err => console.error("❌ Erreur MongoDB :", err));




// --- 3. MODÈLES (SCHEMAS) ---

const userSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    profilePic: {type: String,default: "/images/noprofil.png"},
    contacts: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    

});




const User = mongoose.model("User", userSchema);

const messageSchema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    message: String,
    file: String,
    seen: {type: Boolean,default: false},
    createdAt: { type: Date, default: Date.now }
});




const Message = mongoose.model("Message", messageSchema);

// --- 4. CONFIGURATION MULTER (UPLOADS) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

// --- 5. ROUTES API (AUTHENTIFICATION) ---

app.post("/signup", async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.json({ success: false, message: "Email déjà utilisé" });

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, email, password: hashedPassword });
        await newUser.save();

        res.json({ success: true, message: "Utilisateur créé !" });
    } catch (err) {
        res.status(500).json({ success: false, message: "Erreur serveur" });
    }
});

app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.json({ success: false, message: "Email incorrect" });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.json({ success: false, message: "Mot de passe incorrect" });

        res.json({ success: true, message: "Connexion réussie", user });
    } catch (err) {
        res.json({ success: false, message: "Erreur serveur" });
    }
});

// --- 6. ROUTES API (CONTACTS) ---

app.post("/searchUser", async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.json({ success: false });
    res.json({ success: true, user });
});

app.post("/addContact", async (req, res) => {
    try {
        const { userId, contactId } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.json({ success: false });

        if (user.contacts.includes(contactId)) {
            return res.json({ success: false, message: "Déjà ajouté" });
        }

        user.contacts.push(contactId);
        await user.save();
        res.json({ success: true, message: "Contact ajouté" });
    } catch (err) {
        res.json({ success: false, message: "Erreur serveur" });
    }
});

app.get("/contacts/:userId", async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).populate("contacts", "username email profilePic");
        if (!user) return res.json({ success: false });
        res.json({ success: true, contacts: user.contacts });
    } catch (err) {
        res.json({ success: false });
    }
});

// --- 7. ROUTES API (MESSAGES) ---

app.get("/messages/:userId/:receiverId", async (req, res) => {
    try {
        const { userId, receiverId } = req.params;
        const messages = await Message.find({
            $or: [
                { sender: userId, receiver: receiverId },
                { sender: receiverId, receiver: userId }
            ]
        }).sort({ createdAt: 1 });
        res.json({ success: true, messages });
    } catch (err) {
        res.json({ success: false });
    }
});

app.post("/upload", upload.single("file"), async (req, res) => {
    const { sender, receiver, message } = req.body;
    const filePath = req.file ? `/uploads/${req.file.filename}` : null;

    const newMsg = new Message({ sender, receiver, message, file: filePath });
    await newMsg.save();

    io.to(receiver).emit("receiveMessage", newMsg);
    io.to(sender).emit("receiveMessage", newMsg); 
    res.json({ success: true, data: newMsg });
});

// --- 8. LOGIQUE SOCKET.IO ---

let onlineUsers = {};

io.on("connection", (socket) => {

    console.log("🔌 Utilisateur connecté :", socket.id);

    // rejoindre sa room + statut online
    socket.on("join", (userId) => {

        socket.join(userId);

        onlineUsers[userId] = socket.id;

        console.log(`User ${userId} connecté`);

        // 🔥 notifier tout le monde
        io.emit("userStatus", {
            userId,
            status: "online"
        });

    });

    // envoi message
    socket.on("sendMessage", async (data) => {

        const { sender, receiver, message } = data;

        const newMsg = new Message({
            sender,
            receiver,
            message
        });

        await newMsg.save();

        // envoyer au receiver
        io.to(receiver).emit("receiveMessage", newMsg);

        // envoyer au sender
        io.to(sender).emit("receiveMessage", newMsg);

    });

    // déconnexion
    socket.on("disconnect", () => {

        console.log("❌ Utilisateur déconnecté");

        for(let userId in onlineUsers){

            if(onlineUsers[userId] === socket.id){

                delete onlineUsers[userId];

                io.emit("userStatus", {
                    userId,
                    status: "offline"
                });

            }

        }

    });
    socket.on("getStatus", (userId) => {

const isOnline = onlineUsers[userId] ? "online" : "offline";

socket.emit("userStatus", {
userId,
status: isOnline
});

});

});




// --- 9. LANCEMENT DU SERVEUR ---

server.listen(PORT, () => {
    console.log(`🚀 Serveur lancé sur http://localhost:${PORT}`);
});







app.post("/updateProfile", async (req, res) => {
    try {

        const { userId, username, email } = req.body;

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { username, email },
            { new: true }
        );

        res.json({
            success: true,
            user: updatedUser
        });

    } catch (err) {
        console.log(err);
        res.json({ success: false });
    }
});







app.post("/uploadProfilePic", upload.single("image"), async (req, res) => {

try {

const userId = req.body.userId;

const imageUrl = "/uploads/" + req.file.filename;

await User.findByIdAndUpdate(userId, {
profilePic: imageUrl
});

res.json({
success: true,
imageUrl
});

} catch (err) {
res.json({ success: false });
}

});
app.get("/user/:id", async (req,res)=>{

const user = await User.findById(req.params.id);

res.json({ user });

});


//CONVERSATION
app.get("/conversations/:userId", async (req, res) => {
    try {

        const userId = req.params.userId;

        const messages = await Message.find({
            $or: [
                { sender: userId },
                { receiver: userId }
            ]
        }).sort({ createdAt: -1 });

        const conversations = {};

        messages.forEach(msg => {

            const otherUser = msg.sender == userId ? msg.receiver : msg.sender;

            if(!conversations[otherUser]){
                conversations[otherUser] = {
                    lastMessage: msg.message,
                    date: msg.createdAt,
                    unread: 0
                };
            }

            // compter messages non lus
            if(msg.receiver == userId && !msg.seen){
                conversations[otherUser].unread++;
            }

        });

        res.json({
            success: true,
            conversations
        });

    } catch (err) {
        console.log(err);
        res.json({ success: false });
    }
});

app.post("/markSeen", async (req,res)=>{

const { userId, receiver } = req.body;

await Message.updateMany(
{
sender: receiver,
receiver: userId,
seen: false
},
{ seen: true }
);

res.json({ success:true });

});




// notification en ligne ou online




