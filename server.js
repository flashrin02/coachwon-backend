const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const mqtt = require('mqtt');
const PORT = process.env.PORT || 5000;

const app = express();
app.use(express.json());
app.use(cors());

// --- CONNESSIONE MONGODB ATLAS ---
const MONGO_URI = "mongodb://10934207_db_user:Salame321@ac-jcgcxhr-shard-00-00.epxwxlo.mongodb.net:27017,ac-jcgcxhr-shard-00-01.epxwxlo.mongodb.net:27017,ac-jcgcxhr-shard-00-02.epxwxlo.mongodb.net:27017/coachwon?ssl=true&replicaSet=atlas-12jz4c-shard-0&authSource=admin&appName=verifica";

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ Connesso a MongoDB Atlas"))
    .catch(err => console.error("❌ Errore MongoDB:", err));

// --- SCHEMA UTENTE ---
const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, unique: true },
    password: String,
    ingredienti: [
        {
            id_tag: String,
            prodotto: String,
            peso: Number,
            data: { type: Date, default: Date.now }
        }
    ]
}, { collection: 'utenti' }));

// --- LOGICA MQTT ---
const mqttClient = mqtt.connect('mqtt://broker.hivemq.com');

mqttClient.on('connect', () => {
    console.log("📡 MQTT Connesso. In ascolto su: coachwon/utenti");
    mqttClient.subscribe('coachwon/utenti');
});

// ... dentro mqttClient.on('message' ...
mqttClient.on('message', async (topic, message) => {
    try {
        const data = JSON.parse(message.toString());
        const { username, prodotto, peso } = data;
        
        // Puliamo il nome prodotto da eventuali spazi o caratteri strani
        const prodottoPulito = prodotto.trim();

        // Cerchiamo l'utente
        const user = await User.findOne({ username: username });

        if (user) {
            // Controlliamo se l'ingrediente esiste già
            const ingredienteIndex = user.ingredienti.findIndex(i => i.prodotto === prodottoPulito);

            if (ingredienteIndex !== -1) {
                // AGGIORNA ESISTENTE
                user.ingredienti[ingredienteIndex].peso = peso;
                user.ingredienti[ingredienteIndex].data = new Date();
                console.log(`⚖️ Aggiornato: ${prodottoPulito} -> ${peso}g`);
            } else {
                // AGGIUNGI NUOVO (Se lo avevi cancellato, rientra qui)
                user.ingredienti.push({
                    prodotto: prodottoPulito,
                    peso: peso,
                    id_tag: "NFC_TEMP", // o quello che ricevi
                    data: new Date()
                });
                console.log(`🆕 Aggiunto nuovo prodotto: ${prodottoPulito}`);
            }
            await user.save();
        } else {
            console.log("❌ Utente non trovato nel DB:", username);
        }
    } catch (err) {
        console.error("❌ Errore processamento:", err);
    }
});

// --- ROTTE API ---
app.post('/api/register', async (req, res) => {
    try {
        // Estraiamo SOLO username e password dal body della richiesta
        const { username, password } = req.body;

        // Controllo di sicurezza base
        if (!username || !password) {
            return res.status(400).json({ message: "Username e password sono obbligatori!" });
        }

        // 1. CONTROLLA SE L'UTENTE ESISTE GIÀ
        // Nota: adatta "User" o "db.collection('utenti')" in base a come gestisci i modelli (Mongoose o MongoDB nativo)
        const utenteEsistente = await User.findOne({ username }); 
        if (utenteEsistente) {
            return res.status(400).json({ message: "Questo username è già registrato!" });
        }

        // 2. CREA IL NUOVO UTENTE
        // Creiamo il record impostando l'inventario vuoto. 
        // I campi WiFi rimarranno vuoti o stringhe vuote finché l'ESP32 non manderà i dati.
        const nuovoUtente = new User({
            username,
            password,          // Se usi bcrypt per fare l'hash della password, ricordati di farlo qui!
            wifiSSID: "",      // Inizialmente vuoto, lo aggiornerà l'ESP32
            ingredienti: []    // La dispensa parte vuota
        });

        // 3. SALVA NEL DATABASE
        await nuovoUtente.save();

        res.status(201).json({ message: "Account creato con successo!" });

    } catch (error) {
        console.error("Errore durante la registrazione:", error);
        res.status(500).json({ message: "Errore interno del server" });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.body.username, password: req.body.password });
        if (user) {
            // Mandiamo tutto l'utente, inclusi gli ingredienti
            res.json(user);
        } else {
            res.status(401).json({ message: "Credenziali errate" });
        }
    } catch (err) {
        res.status(500).json({ message: "Errore server" });
    }
});

app.get('/api/login_refresh', async (req, res) => {
    try {
        const { username } = req.query;
        const user = await User.findOne({ username });
        if (user) {
            res.json(user);
        } else {
            res.status(404).json({ message: "Utente non trovato" });
        }
    } catch (err) {
        res.status(500).json({ message: "Errore refresh" });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));