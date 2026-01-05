import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Engine from "./pages/Engine";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/app" element={<Engine />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
