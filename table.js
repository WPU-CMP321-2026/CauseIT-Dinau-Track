document.addEventListener("DOMContentLoaded", () => {
  const tableBody = document.querySelector("#dinauTable tbody");

  fetch("get_records.php")
    .then((response) => response.json())
    .then((records) => {
      if (records.error) {
        throw new Error(records.error);
      }

      records.forEach((record) => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${record.customer}</td>
          <td>${record.borrowed}</td>
          <td>${record.interestRate}%</td>
          <td>${record.yetToRepay}</td>
          <td>${record.interestPaid}</td>
          <td>${record.dueDate}</td>
        `;
        tableBody.appendChild(row);
      });
    })
    .catch((error) => {
      const row = document.createElement("tr");
      row.innerHTML = `<td colspan="6">Failed to load records: ${error.message}</td>`;
      tableBody.appendChild(row);
    });
});
