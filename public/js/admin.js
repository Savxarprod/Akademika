const table = document.getElementById("requestsTable");
const statusText = document.getElementById("adminStatus");

async function loadRequests() {
  try {
    const response = await fetch("/api/requests");
    const result = await response.json();

    if (!result.success) {
      statusText.textContent = "Не удалось загрузить заявки";
      return;
    }

    if (result.data.length === 0) {
      statusText.textContent = "Заявок пока нет";
      table.innerHTML = "";
      return;
    }

    statusText.textContent = `Всего заявок: ${result.data.length}`;

    table.innerHTML = result.data.map(item => {
      const date = new Date(item.created_at).toLocaleString("ru-RU");

      return `
        <tr>
          <td>${item.id}</td>
          <td>${escapeHtml(item.work_type)}</td>
          <td>${escapeHtml(item.deadline)}</td>
          <td>${escapeHtml(item.topic)}</td>
          <td>${item.pages}</td>
          <td>${item.originality}%</td>
          <td>${escapeHtml(item.contact)}</td>
          <td>${date}</td>
          <td>
            <button class="delete-btn" onclick="deleteRequest(${item.id})">
              Удалить
            </button>
          </td>
        </tr>
      `;
    }).join("");
  } catch (error) {
    statusText.textContent = "Ошибка соединения с сервером";
  }
}

async function deleteRequest(id) {
  const confirmed = confirm("Удалить эту заявку?");

  if (!confirmed) {
    return;
  }

  try {
    const response = await fetch(`/api/requests/${id}`, {
      method: "DELETE"
    });

    const result = await response.json();

    if (result.success) {
      loadRequests();
    }
  } catch (error) {
    alert("Не удалось удалить заявку");
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

loadRequests();