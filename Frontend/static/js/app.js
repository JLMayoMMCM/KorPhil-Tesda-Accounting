// Page behavior. Loaded once; hx-boost swaps the body, so everything here is delegated.
const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

function icons() {
    if (window.lucide) lucide.createIcons({ attrs: { width: 16, height: 16, "stroke-width": 1.75 } });
}
document.addEventListener("DOMContentLoaded", icons);
document.addEventListener("htmx:afterSettle", icons);

function updateSelection(form) {
    const boxes = [...form.querySelectorAll("input[name=sel]:checked")];
    const sum = boxes.reduce((a, b) => a + parseFloat(b.dataset.amount || 0), 0);
    form.querySelectorAll("[data-sel-count]").forEach((n) => (n.textContent = boxes.length));
    form.querySelector("[data-sel-sum]").textContent = peso.format(sum);
}

function updateDirty(form) {
    const changed = [...form.elements]
        .filter((el) => el.name && el.type !== "hidden" && el.type !== "submit")
        .filter((el) => el.tagName === "SELECT"
            ? [...el.options].some((o) => o.selected !== o.defaultSelected)
            : el.value !== el.defaultValue)
        .map((el) => el.closest("label").firstChild.textContent.trim());
    const list = form.querySelector("[data-dirty-list]");
    list.hidden = !changed.length;
    list.textContent = "Changed: " + changed.join(", ");
    const note = form.querySelector("[data-dirty-note]");
    if (form.dataset.row) {
        note.textContent = changed.length ? `Unsaved · writes to row ${form.dataset.row}` : `No changes · row ${form.dataset.row}`;
    }
    form.classList.toggle("is-dirty", changed.length > 0);
}

document.addEventListener("change", (e) => {
    const bulk = e.target.closest("[data-bulk]");
    if (bulk && e.target.matches("[data-select-all]")) {
        bulk.querySelectorAll("input[name=sel]").forEach((b) => (b.checked = e.target.checked));
    }
    if (bulk && (e.target.name === "sel" || e.target.matches("[data-select-all]"))) updateSelection(bulk);
    if (e.target.matches("[data-autosubmit]")) e.target.form.requestSubmit();
});

document.addEventListener("input", (e) => {
    const form = e.target.closest("[data-dirty-form]");
    if (form) updateDirty(form);
});

document.addEventListener("click", (e) => {
    const row = e.target.closest("tr[data-row-link]");
    if (row && !e.target.closest("a, button, input, label, .col-check")) row.querySelector("td.strong a").click();

    const later = e.target.closest("[data-toggle-later]");
    if (later) {
        const body = later.closest("tbody");
        const open = body.classList.toggle("open");
        later.setAttribute("aria-expanded", open);
        later.textContent = open ? "Hide" : `Show ${body.rows.length - 1}`;
    }

    const clear = e.target.closest("[data-clear-sel]");
    if (clear) {
        const form = clear.closest("form");
        form.querySelectorAll("input[name=sel], [data-select-all]").forEach((b) => (b.checked = false));
        updateSelection(form);
    }

    if (e.target.closest("[data-print]")) window.print();
});

document.addEventListener("keydown", (e) => {
    const typing = e.target.closest("input, textarea, select");
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.querySelector(".search input").focus();
    } else if (mod && e.key.toLowerCase() === "s") {
        const form = document.querySelector("[data-dirty-form]");
        if (form) { e.preventDefault(); form.requestSubmit(); }
    } else if (e.key === "Escape") {
        if (typing) e.target.blur();
        else document.querySelector('[data-key="Escape"]')?.click();
    } else if (!typing && !mod && !e.altKey) {
        const target = document.querySelector(`[data-key="${e.key.toLowerCase()}"]`);
        if (target) { e.preventDefault(); target.click(); }
    }
});
