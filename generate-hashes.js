const bcrypt = require('bcrypt');

const users = [
    { username: "Alexander", password: "senha123" },
    { username: "Lucas", password: "senha123" },
    { username: "Alberto", password: "senha123" },
    { username: "Fernanda", password: "senha123" },
    { username: "Thais", password: "senha123" },
    { username: "Ivani", password: "senha123" },
    { username: "Vacina", password: "senha123" },
    { username: "Triagem", password: "senha123" }
];

async function generateHashes() {
    for (const user of users) {
        const hashedPassword = await bcrypt.hash(user.password, 10);
        console.log(`Username: ${user.username}, Hashed Password: ${hashedPassword}`);
    }
}

generateHashes();
