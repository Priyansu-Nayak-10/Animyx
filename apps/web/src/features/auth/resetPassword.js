import './auth.js';

/* Legacy implementation migrated into auth.js.
import { supabase } from "../../core/utils.js";

function setButtonLoading(button, loading) {
  if (!button) return;
  button.classList.toggle("loading", Boolean(loading));
  button.disabled = Boolean(loading);
}

function showInlineError(inputElement, message) {
  const errorNode = inputElement?.closest(".form-group")?.querySelector(".input-error");
  if (errorNode) {
    errorNode.textContent = String(message || "");
    errorNode.classList.add("visible");
  }
  inputElement?.classList.add("error");
}

function clearInlineError(inputElement) {
  const errorNode = inputElement?.closest(".form-group")?.querySelector(".input-error");
  if (errorNode) {
    errorNode.textContent = "";
    errorNode.classList.remove("visible");
  }
  inputElement?.classList.remove("error");
}

function showBackendError(container, message) {
  const errorBox = container?.querySelector(".backend-error");
  if (!errorBox) return;
  errorBox.textContent = String(message || "");
}

function clearBackendError(container) {
  const errorBox = container?.querySelector(".backend-error");
  if (!errorBox) return;
  errorBox.textContent = "";
}

function bindPasswordToggle() {
  document.querySelectorAll(".toggle-password").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const input = document.getElementById(button.dataset.target || "");
      if (!input) return;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.setAttribute("aria-pressed", show ? "true" : "false");
      button.innerHTML = show ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>';
    });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("reset-form");
  const submitBtn = document.getElementById("reset-btn");
  const backendBox = document.querySelector(".auth-form-body");
  const newPasswordInput = document.getElementById("new-password");
  const confirmInput = document.getElementById("confirm-password");

  bindPasswordToggle();
  if (!form || !submitBtn || !backendBox || !newPasswordInput || !confirmInput) return;

  const { data } = await supabase.auth.getSession();
  if (!data?.session) {
    showBackendError(backendBox, "Reset link is invalid or expired. Request a new password reset email.");
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearBackendError(backendBox);
    clearInlineError(newPasswordInput);
    clearInlineError(confirmInput);

    const nextPassword = String(newPasswordInput.value || "");
    const confirmPassword = String(confirmInput.value || "");

    let valid = true;
    if (nextPassword.length < 8) {
      showInlineError(newPasswordInput, "Password must be at least 8 characters.");
      valid = false;
    }
    if (confirmPassword !== nextPassword) {
      showInlineError(confirmInput, "Passwords do not match.");
      valid = false;
    }
    if (!valid) return;

    setButtonLoading(submitBtn, true);
    try {
      const { error } = await supabase.auth.updateUser({ password: nextPassword });
      if (error) throw error;
      showBackendError(backendBox, "Password updated successfully. Redirecting to sign in...");
      setTimeout(() => { window.location.href = '/pages/signin.html'; }, 1200);
    } catch (error) {
      showBackendError(backendBox, error?.message || "Failed to update password.");
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });
});
*/
