/* global document */
const form = document.querySelector("#profile-form");
const status = document.querySelector("#form-status");
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const displayName = new FormData(form).get("displayName");
  const rejected = String(displayName).toLowerCase() === "blocked";
  status.dataset.outcome = rejected ? "rejected" : "accepted";
  status.textContent = rejected ? "Display name is unavailable" : "Profile accepted";
});
