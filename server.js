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
const io = new Server(server, { cors: { origin: "*" } });

// --- 1. MIDDLEWARES ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// --- 2. CONNEXION MONGODB ---
const mongoURI = process.env.MONGO_URI || "mongodb+srv://nelson:a4gb5ui6@cluster0.uvjq8jz.mongodb.net/?appName=Cluster0";
const PORT = process.env.PORT || 3000;

mongoose.connect(mongoURI)
    .then(() => console.log(`✅ Connecté à MongoDB`))
    .catch(err => console.error("❌ Erreur MongoDB :", err));

// --- 3. MODÈLES (SCHEMAS) ---
const userSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    profilePic: { type: String, default: "/images/noprofil.png" },
    contacts: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
});

const messageSchema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    message: String,
    file: String,
    seen: { type: Boolean, default: false },
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
    edited: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);
const Message = mongoose.model("Message", messageSchema);

// --- 4. CONFIGURATION MULTER ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

// --- 5. ROUTES AUTHENTIFICATION & PROFIL ---
app.post("/signup", async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (await User.findOne({ email })) return res.json({ success: false, message: "Email déjà utilisé" });
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, email, password: hashedPassword });
        await newUser.save();
        res.json({ success: true, message: "Utilisateur créé !" });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.json({ success: false, message: "Identifiants incorrects" });
        }
        res.json({ success: true, user });
    } catch (err) { res.json({ success: false }); }
});

app.get("/user/:id", async (req, res) => {
    const user = await User.findById(req.params.id);
    res.json({ user });
});

app.post("/updateProfile", async (req, res) => {
    try {
        const { userId, username, email } = req.body;
        const updatedUser = await User.findByIdAndUpdate(userId, { username, email }, { new: true });
        res.json({ success: true, user: updatedUser });
    } catch (err) { res.json({ success: false }); }
});

app.post("/uploadProfilePic", upload.single("image"), async (req, res) => {
    try {
        const imageUrl = "/uploads/" + req.file.filename;
        await User.findByIdAndUpdate(req.body.userId, { profilePic: imageUrl });
        res.json({ success: true, imageUrl });
    } catch (err) { res.json({ success: false }); }
});

// --- 6. ROUTES CONTACTS ---
app.post("/searchUser", async (req, res) => {
    const user = await User.findOne({ email: req.body.email });
    res.json({ success: !!user, user });
});

app.post("/addContact", async (req, res) => {
    try {
        const { userId, contactId } = req.body;
        const user = await User.findById(userId);
        if (user && !user.contacts.includes(contactId)) {
            user.contacts.push(contactId);
            await user.save();
            return res.json({ success: true, message: "Contact ajouté" });
        }
        res.json({ success: false, message: "Erreur ou déjà ajouté" });
    } catch (err) { res.json({ success: false }); }
});

app.get("/contacts/:userId", async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).populate("contacts", "username email profilePic");
        res.json({ success: true, contacts: user.contacts });
    } catch (err) { res.json({ success: false }); }
});

// --- 7. ROUTES MESSAGES & CONVERSATIONS ---

// Récupérer les messages avec tags (version optimisée)
app.get("/messages/:userId/:receiverId", async (req, res) => {
    try {
        const { userId, receiverId } = req.params;
     const messages = await Message.find({
    $or: [
        { sender: userId, receiver: receiverId },
        { sender: receiverId, receiver: userId }
    ]
}).sort({ createdAt: 1 })
  .populate({
      path: 'replyTo',
      populate: { path: 'sender', select: 'username' } // On récupère le nom de l'expéditeur du message original
  });
        res.json({ success: true, messages });
    } catch (err) { res.json({ success: false }); }
});

app.get("/conversations/:userId", async (req, res) => {
    try {
        const userId = req.params.userId;

        // 1. On récupère les messages et on "remplit" (populate) les infos des utilisateurs
        const messages = await Message.find({
            $or: [{ sender: userId }, { receiver: userId }]
        })
        .sort({ createdAt: -1 })
        .populate("sender", "username email profilePic") // On récupère ces 3 champs
        .populate("receiver", "username email profilePic");

        const conversations = {};

        messages.forEach(msg => {
            // Déterminer qui est "l'autre" personne
            // Si le sender est moi, l'autre est le receiver. Sinon c'est le sender.
            const otherUser = msg.sender._id.toString() === userId ? msg.receiver : msg.sender;
            const otherId = otherUser._id.toString();

            if (!conversations[otherId]) {
                conversations[otherId] = {
                    lastMessage: msg.message,
                    date: msg.createdAt,
                    unread: 0,
                    // ON AJOUTE LES INFOS ICI :
                    username: otherUser.username, 
                    email: otherUser.email,
                    profilePic: otherUser.profilePic
                };
            }
            if (msg.receiver._id.toString() === userId && !msg.seen) {
                conversations[otherId].unread++;
            }
        });

        res.json({ success: true, conversations });
    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});

app.post("/markSeen", async (req, res) => {
    const { userId, receiver } = req.body;
    await Message.updateMany({ sender: receiver, receiver: userId, seen: false }, { seen: true });
    res.json({ success: true });
});

app.post("/editMessage", async (req, res) => {
    try {
        const { id, newText } = req.body;
        const msg = await Message.findByIdAndUpdate(id, { message: newText, edited: true }, { new: true });
        
        if (msg) {
            // On prévient tout le monde que le message a changé
            io.to(msg.receiver.toString()).emit("messageEdited", { id, newText });
            io.to(msg.sender.toString()).emit("messageEdited", { id, newText });
        }
        res.json({ success: true });
    } catch (err) {
        res.json({ success: false });
    }
});

app.post("/deleteMessage", async (req, res) => {
    try {
        const { id } = req.body;
        const msg = await Message.findById(id);

        if (!msg) return res.json({ success: false, message: "Message introuvable" });

        if (msg.deleted) {
            // DEUXIÈME CLIC : Suppression définitive
            await Message.findByIdAndDelete(id);
            io.to(msg.receiver.toString()).emit("messageHardDeleted", id);
            io.to(msg.sender.toString()).emit("messageHardDeleted", id);
            return res.json({ success: true, action: "hard_delete" });
        } else {
            // PREMIER CLIC : Marquage comme supprimé
            msg.deleted = true;
            msg.message = "🚫 Ce message a été supprimé";
            await msg.save();
            
            io.to(msg.receiver.toString()).emit("messageSoftDeleted", { id, text: msg.message });
            io.to(msg.sender.toString()).emit("messageSoftDeleted", { id, text: msg.message });
            return res.json({ success: true, action: "soft_delete" });
        }
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.post("/forwardMessage", async (req, res) => {
    try {
        const { id, newReceiver } = req.body;
        const originalMsg = await Message.findById(id);

        const newMsg = new Message({
            sender: req.body.userId || originalMsg.sender, // ou via ta session
            receiver: newReceiver,
            message: originalMsg.message,
            isForwarded: true, // Optionnel : pour mettre un label
            createdAt: new Date()
        });

        await newMsg.save();

        // C'EST CETTE LIGNE QUI MANQUE :
        res.json({ success: true, message: newMsg }); 
        
    } catch (err) {
        res.json({ success: false });
    }
});

app.post("/upload", upload.single("file"), async (req, res) => {
    const { sender, receiver, message } = req.body;
    const newMsg = new Message({ sender, receiver, message, file: req.file ? `/uploads/${req.file.filename}` : null });
    await newMsg.save();
    io.to(receiver).emit("receiveMessage", newMsg);
    io.to(sender).emit("receiveMessage", newMsg);
    res.json({ success: true, data: newMsg });
});

// --- 8. LOGIQUE SOCKET.IO ---
let onlineUsers = {};

io.on("connection", (socket) => {
    console.log("🔌 Connecté :", socket.id);

    socket.on("join", (userId) => {
        socket.join(userId);
        onlineUsers[userId] = socket.id;
        io.emit("userStatus", { userId, status: "online" });
    });

   socket.on("sendMessage", async (data) => {
    const { sender, receiver, message, replyTo } = data;

    // A. Sauvegarde en base de données
    const newMsg = new Message({
        sender,
        receiver,
        message,
        replyTo: replyTo || null
    });
    await newMsg.save();

    // B. RÉCUPÉRATION DEPUIS LA BASE (avec le texte du tag)
    // C'est cette étape qui garantit que le message s'affiche avec son tag
const fullMsg = await Message.findById(newMsg._id)
    .populate({
        path: 'replyTo',
        populate: { path: 'sender', select: 'username' }
    });
    // C. RENVOI AUX DEUX UTILISATEURS
    io.to(receiver).emit("receiveMessage", fullMsg); // Pour l'ami
    io.to(sender).emit("receiveMessage", fullMsg);   // POUR TOI (Déclenche l'affichage chez toi)
});

    socket.on("getStatus", (userId) => {
        socket.emit("userStatus", { userId, status: onlineUsers[userId] ? "online" : "offline" });
    });

    socket.on("disconnect", () => {
        for (let userId in onlineUsers) {
            if (onlineUsers[userId] === socket.id) {
                delete onlineUsers[userId];
                io.emit("userStatus", { userId, status: "offline" });
            }
        }
    });
});

// --- 9. LANCEMENT ---
server.listen(PORT, () => console.log(`🚀 Serveur sur port ${PORT}`));