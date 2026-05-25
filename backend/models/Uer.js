const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: String,
    password: String,
    ingredienti: [{
        nome: String,
        quantita: Number,   
    }]
});

module.exports = mongoose.model('User', UserSchema);