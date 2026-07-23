/* global document */
const form = document.querySelector("#registration-form");
const status = document.querySelector("#form-status");
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const username = new FormData(form).get("username");
  const rejected = String(username).toLowerCase() === "admin";
  status.dataset.outcome = rejected ? "rejected" : "accepted";
  status.textContent = rejected ? "Username is reserved" : "Registration accepted";
});
