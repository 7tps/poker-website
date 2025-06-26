import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Homepage() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [mode, setMode] = useState("login"); // 'login' or 'register'
    const navigate = useNavigate();

    const handleRegister = async (e) => {
        e.preventDefault();
        setError("");
        if (!username || !password) {
            setError("Username and password are required");
            return;
        }
        try {
            const res = await fetch("/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });
            if (res.ok) {
                alert("Registration successful! Please login.");
                setMode("login");
                setPassword("");
            } else {
                const data = await res.json();
                setError(data.message || "Registration failed");
            }
        } catch (err) {
            setError("Network error");
        }
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setError("");
        if (!username || !password) {
            setError("Username and password are required");
            return;
        }
        try {
            const res = await fetch("/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });
            if (res.ok) {
                localStorage.setItem("username", username);
                navigate("/game");
            } else {
                const data = await res.json();
                setError(data.message || "Login failed");
            }
        } catch (err) {
            setError("Network error");
        }
    };

    return (
        <div style={{ maxWidth: 400, margin: "auto", padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
                <button
                    onClick={() => { setMode("login"); setError(""); }}
                    style={{
                        padding: "8px 16px",
                        marginRight: 8,
                        background: mode === "login" ? "#61dafb" : "#eee",
                        border: "none",
                        borderRadius: 6,
                        fontWeight: mode === "login" ? "bold" : "normal",
                        cursor: "pointer"
                    }}
                >
                    Login
                </button>
                <button
                    onClick={() => { setMode("register"); setError(""); }}
                    style={{
                        padding: "8px 16px",
                        background: mode === "register" ? "#61dafb" : "#eee",
                        border: "none",
                        borderRadius: 6,
                        fontWeight: mode === "register" ? "bold" : "normal",
                        cursor: "pointer"
                    }}
                >
                    Register
                </button>
            </div>
            {mode === "register" ? (
                <>
                    <h2>Create a New Account</h2>
                    <form onSubmit={handleRegister}>
                        <input
                            type="text"
                            placeholder="Username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
                        />
                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
                        />
                        <button type="submit" style={{ padding: "8px 16px" }}>
                            Register
                        </button>
                    </form>
                </>
            ) : (
                <>
                    <h2>Login</h2>
                    <form onSubmit={handleLogin}>
                        <input
                            type="text"
                            placeholder="Username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
                        />
                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
                        />
                        <button type="submit" style={{ padding: "8px 16px" }}>
                            Login
                        </button>
                    </form>
                </>
            )}
            {error && <p style={{ color: "red", marginTop: 10 }}>{error}</p>}
        </div>
    );
}
