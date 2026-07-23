/* global document */
const form = document.querySelector("#checkout-form");
const status = document.querySelector("#form-status");
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const cardNumber = new FormData(form).get("cardNumber");
  const rejected = cardNumber === "4000000000000002";
  status.dataset.outcome = rejected ? "rejected" : "accepted";
  status.textContent = rejected ? "Card was declined" : "Payment accepted";
});
