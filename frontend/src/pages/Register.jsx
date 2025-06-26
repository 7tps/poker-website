import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

function Register() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const navigate = useNavigate();

    const handleRegister = async (e) => {
        e.preventDefault();
        const res = await fetch("/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
        });
        if (res.ok) navigate("/login");
        else alert("Registration failed");
    };

    return (
        <form onSubmit={handleRegister}>
            <h2>Register</h2>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" required />
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" required />
            <button type="submit">Register</button>
        </form>
    );
}

export default Register;