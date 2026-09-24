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
    form.querySelector(".bulkbar [data-confirm]").dataset.confirm =
        `Mark ${boxes.length} voucher${boxes.length === 1 ? "" : "s"} paid (${peso.format(sum)})?`;
}

// Writes: ask first where the button says so (data-confirm), then block the page while the sheet is written (data-busy).
// Boosted swaps and full page loads replace the <dialog>s, which closes them.
let pending = null; // runs when the confirm dialog's OK is pressed
function ask(question, note, ok, then) {
    const dialog = document.getElementById("confirm");
    dialog.querySelector("[data-confirm-text]").textContent = question;
    dialog.querySelector("[data-confirm-note]").textContent = note;
    dialog.querySelector("button[value=ok]").textContent = ok;
    pending = then;
    dialog.showModal();
}

const dirtyForm = () => document.querySelector("[data-dirty-form].is-dirty");
function askDiscard(then) {
    const form = dirtyForm();
    ask("Discard unsaved changes?", `${form.querySelector("[data-dirty-list]").textContent}. Not saved to the sheet yet.`,
        "Discard", () => { form.classList.remove("is-dirty"); then(); });
}

// After a write the page reloads; put the user back where they were.
const here = () => location.pathname + location.search;
function saveScroll() {
    try { sessionStorage.setItem("scroll", JSON.stringify([here(), scrollY])); } catch {}
}
function restoreScroll() {
    try {
        const [url, y] = JSON.parse(sessionStorage.getItem("scroll")) || [];
        sessionStorage.removeItem("scroll");
        if (url === here()) scrollTo(0, y);
    } catch {}
}
document.addEventListener("DOMContentLoaded", restoreScroll);
document.addEventListener("htmx:afterSettle", () => setTimeout(restoreScroll)); // after htmx's own scroll-to-top

document.addEventListener("submit", (e) => {
    const form = e.target, button = e.submitter;
    if (form.method === "dialog") { // the confirm dialog's own buttons
        const then = button?.value === "ok" && pending;
        pending = null;
        if (then) setTimeout(then); // once this dialog has closed, so the next one can open
        return;
    }
    if (button?.hasAttribute("formaction")) return; // export: a download, the page stays
    const stop = (then) => {
        e.preventDefault();
        e.stopPropagation(); // capture phase: htmx's own submit handler on the form never runs
        then();
    };
    const dirty = dirtyForm();
    if (dirty && dirty !== form) return stop(() => askDiscard(() => form.requestSubmit(button)));
    const question = button?.dataset.confirm || form.dataset.confirm;
    if (question && !form.dataset.confirmed) {
        return stop(() => ask(question, "This writes PAID to the Status column in the Google Sheet.", "Mark paid", () => {
            form.dataset.confirmed = "1";
            form.requestSubmit(button);
        }));
    }
    delete form.dataset.confirmed;
    if (form.dataset.busy) {
        const busy = document.getElementById("busy");
        busy.querySelector("[data-busy-text]").textContent = form.dataset.busy;
        busy.showModal();
        saveScroll();
    }
}, true);
// Links (forms are covered above) and closing the tab also ask before dropping edits.
document.addEventListener("htmx:confirm", (e) => {
    if (e.detail.elt.tagName === "FORM" || !dirtyForm()) return;
    e.preventDefault();
    askDiscard(() => e.detail.issueRequest(true));
});
window.addEventListener("beforeunload", (e) => { if (dirtyForm()) e.preventDefault(); });
document.addEventListener("cancel", (e) => { if (e.target.id === "busy") e.preventDefault(); }, true);
const closeBusy = () => document.getElementById("busy")?.close();
document.addEventListener("htmx:afterRequest", (e) => { if (!e.detail.successful) closeBusy(); });
window.addEventListener("pageshow", closeBusy); // back button restoring a page mid-save

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
    if (document.querySelector("dialog[open]")) return; // the dialog owns the keyboard
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
