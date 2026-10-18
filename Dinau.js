document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("dinauForm");
  const output = document.getElementById("output");

  function getFormData() {
    const customer = document.getElementById("customer").value.trim();
    const borrowed = parseFloat(document.getElementById("borrowed").value);
    const interestRate = parseFloat(document.getElementById("interestRate").value);
    const yetToRepay = parseFloat(document.getElementById("yetToRepay").value);
    const interestPaid = parseFloat(document.getElementById("interestPaid").value);
    const dueDate = document.getElementById("dueDate").value;

    if (!customer || isNaN(borrowed) || borrowed <= 0 || !dueDate) {
      alert("Please fill out all required fields correctly.");
      return null;
    }

    return { customer, borrowed, interestRate, yetToRepay, interestPaid, dueDate };
  }

  function saveRecord() {
    const record = getFormData();
    if (!record) return;

    const formData = new URLSearchParams();
    Object.entries(record).forEach(([key, value]) => formData.append(key, value));

    fetch("save.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest"
      },
      body: formData.toString()
    })
      .then((response) => response.text())
      .then((text) => {
        output.textContent = text;
        form.reset();
      })
      .catch((error) => {
        output.textContent = "Error saving record: " + error.message;
      });
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveRecord();
  });

  document.getElementById("saveBtn").addEventListener("click", saveRecord);

  // Auto-calc interest
  document.getElementById("borrowed").addEventListener("input", calculateInterest);
  document.getElementById("interestRate").addEventListener("input", calculateInterest);

  function calculateInterest() {
    const borrowed = parseFloat(document.getElementById("borrowed").value);
    const rate = parseFloat(document.getElementById("interestRate").value);
    if (!isNaN(borrowed) && borrowed > 0 && !isNaN(rate) && rate >= 0) {
      const total = borrowed + (borrowed * rate / 100);
      document.getElementById("interestPaid").value = total.toFixed(2);
    }
  }
});
