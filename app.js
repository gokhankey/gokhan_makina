"use strict";

    var firebaseConfig = {
      apiKey: "AIzaSyBZfRIh5ArL-WObbjh09XMa0y--2nvUyFI",
      projectId: "gokhan-makina"
    };

    var DATA_SPACE = "gokhan-makina-v3";
    var idToken = "";
    var pollTimer = null;
    var personnel = [];
    var tasks = [];
    var feed = [];
    var activePerson = null;
    var resetTaskId = null;
    var confirmCallback = null;
    var calendarDate = new Date();

    function $(id) { return document.getElementById(id); }
    function norm(v) { return String(v || "").trim().toLowerCase(); }
    function money(v) { return Number(v || 0).toLocaleString("tr-TR") + " TL"; }
    function esc(v) {
      return String(v || "").replace(/[&<>"']/g, function(c) {
        return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[c];
      });
    }

    function baseDocUrl() {
      return "https://firestore.googleapis.com/v1/projects/" + firebaseConfig.projectId + "/databases/(default)/documents";
    }

    function colUrl(name) {
      return baseDocUrl() + "/artifacts/" + DATA_SPACE + "/public/data/" + name;
    }

    function docUrl(name, id) {
      return colUrl(name) + "/" + id;
    }

    function authHeaders() {
      return {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + idToken
      };
    }

    function toField(value) {
      if (typeof value === "number") {
        if (Number.isInteger(value)) return { integerValue: String(value) };
        return { doubleValue: value };
      }
      if (typeof value === "boolean") return { booleanValue: value };
      return { stringValue: String(value == null ? "" : value) };
    }

    function toFields(obj) {
      var fields = {};
      Object.keys(obj).forEach(function(key) { fields[key] = toField(obj[key]); });
      return fields;
    }

    function fromField(field) {
      if (field.stringValue != null) return field.stringValue;
      if (field.integerValue != null) return Number(field.integerValue);
      if (field.doubleValue != null) return Number(field.doubleValue);
      if (field.booleanValue != null) return Boolean(field.booleanValue);
      return "";
    }

    function fromDoc(doc) {
      var data = {};
      var fields = doc.fields || {};
      Object.keys(fields).forEach(function(key) { data[key] = fromField(fields[key]); });
      data.id = String(doc.name || "").split("/").pop();
      return data;
    }

    async function apiFetch(url, options) {
      var res = await fetch(url, options || {});
      if (!res.ok) {
        var txt = await res.text();
        throw new Error(res.status + " " + txt);
      }
      if (res.status === 204) return {};
      return res.json();
    }

    async function listDocs(name) {
      try {
        var data = await apiFetch(colUrl(name), { headers: authHeaders() });
        return (data.documents || []).map(fromDoc);
      } catch (err) {
        if (String(err.message).indexOf("404") >= 0) return [];
        throw err;
      }
    }

    async function addDoc(name, data) {
      return apiFetch(colUrl(name), {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ fields: toFields(data) })
      });
    }

    async function patchDoc(name, id, data) {
      var masks = Object.keys(data).map(function(key) { return "updateMask.fieldPaths=" + encodeURIComponent(key); }).join("&");
      return apiFetch(docUrl(name, id) + "?" + masks, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ fields: toFields(data) })
      });
    }

    async function deleteDoc(name, id) {
      return apiFetch(docUrl(name, id), { method: "DELETE", headers: authHeaders() });
    }

    function toast(message, type) {
      var item = document.createElement("div");
      item.className = "toast " + (type || "success");
      item.textContent = message;
      $("toast").appendChild(item);
      setTimeout(function() { item.remove(); }, 3600);
    }

    function setConn(text, ok) {
      $("conn-text").textContent = text;
      $("conn-dot").textContent = ok ? "OK" : "...";
      $("status-text").textContent = text;
    }

    async function signInCloud() {
      setConn("Bulut baglantisi kuruluyor", false);
      try {
        var url = "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=" + firebaseConfig.apiKey;
        var data = await apiFetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ returnSecureToken: true })
        });
        idToken = data.idToken || "";
        if (!idToken) throw new Error("Token alinamadi");
        setConn("Bulut baglantisi aktif", true);
        await refreshData();
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(refreshData, 3500);
      } catch (err) {
        console.error(err);
        setConn("Bulut baglantisi kurulamadi", false);
        toast("Bulut baglantisi kurulamadi. Firebase Auth ve Rules kontrol edilmeli.", "error");
      }
    }

    async function refreshData() {
      if (!idToken) return;
      try {
        var all = await Promise.all([listDocs("personnel"), listDocs("tasks"), listDocs("feed")]);
        personnel = all[0];
        tasks = all[1];
        feed = all[2];
        renderAll();
      } catch (err) {
        console.error(err);
        toast("Veriler yuklenemedi. Firebase kurallari izin vermiyor olabilir.", "error");
      }
    }

    function performLogin() {
      $("login-error").classList.remove("show");
      var u = norm($("login-user").value);
      var p = $("login-pass").value.trim();
      if (!idToken) {
        toast("Bulut baglantisi hazir degil. Biraz bekleyin.", "error");
        return;
      }
      if (u === "mesut" && p === "0852") {
        activePerson = null;
        openApp("admin");
        toast("Yonetici girisi basarili.");
        return;
      }
      var person = personnel.find(function(x) { return norm(x.username) === u && String(x.password || "") === p; });
      if (person) {
        activePerson = person.id;
        $("mobile-name").textContent = person.name;
        openApp("personnel");
        toast("Hos geldin, " + person.name);
        return;
      }
      $("login-error").classList.add("show");
    }

    function openApp(role) {
      $("login").classList.add("hidden");
      $("topbar").classList.add("show");
      $("app").classList.add("show");
      $("admin-view").classList.toggle("hidden", role !== "admin");
      $("mobile-view").classList.toggle("hidden", role !== "personnel");
      $("active-label").textContent = role === "admin" ? "Admin" : "Personel";
      renderAll();
    }

    function logout() { location.reload(); }

    function todayStart() {
      var d = new Date();
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    }

    function weekStart() {
      var d = new Date();
      var day = (d.getDay() + 6) % 7;
      return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day).getTime();
    }

    function monthStart(date) {
      var d = date || new Date();
      return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    }

    function sumRevenue(from, to) {
      return tasks
        .filter(function(t) { return t.status === "completed" && Number(t.completedAt || 0) >= from && Number(t.completedAt || 0) < to; })
        .reduce(function(sum, t) { return sum + Number(t.price || 0); }, 0);
    }

    function renderAll() {
      renderStats();
      renderPersonnel();
      renderOpenTasks();
      renderFeed();
      renderMapList();
      renderMobile();
      renderCalendar();
      renderPayments();
    }

    function renderStats() {
      var now = Date.now();
      var ts = todayStart();
      $("stat-personnel").textContent = personnel.length;
      $("stat-open").textContent = tasks.filter(function(t) { return t.status === "open"; }).length;
      $("stat-done").textContent = tasks.filter(function(t) { return t.status === "completed" && Number(t.completedAt || 0) >= ts; }).length;
      $("stat-revenue").textContent = money(sumRevenue(ts, now + 1));
      $("rev-day").textContent = money(sumRevenue(ts, now + 1));
      $("rev-week").textContent = money(sumRevenue(weekStart(), now + 1));
      $("rev-month").textContent = money(sumRevenue(monthStart(), now + 1));
    }

    function renderPersonnel() {
      var list = $("personnel-list");
      var select = $("t-person");
      list.innerHTML = "";
      select.innerHTML = "";
      if (!personnel.length) {
        list.innerHTML = '<p style="text-align:center; color:var(--muted); font-size:13px">Henuz personel yok. Personel ekleyerek baslayin.</p>';
        select.innerHTML = '<option value="">Once personel ekleyin</option>';
        return;
      }
      personnel.forEach(function(p) {
        var openCount = tasks.filter(function(t) { return t.pId === p.id && t.status === "open"; }).length;
        var row = document.createElement("div");
        row.className = "row";
        row.innerHTML =
          '<div><strong>' + esc(p.name) + '</strong><small><span class="badge ' + (openCount ? "badge-green" : "badge-blue") + '">' +
          (openCount ? "Sahada" : "Bekliyor") + '</span> Kullanici: ' + esc(p.username) + '</small></div>' +
          '<div class="row-actions"><button class="btn btn-red" data-id="' + esc(p.id) + '" data-action="delete-personnel">Sil</button></div>';
        list.appendChild(row);
        select.insertAdjacentHTML("beforeend", '<option value="' + esc(p.id) + '">' + esc(p.name) + ' (' + (openCount ? "Sahada" : "Bekliyor") + ')</option>');
      });
    }

    function renderOpenTasks() {
      var list = $("open-list");
      var open = tasks.filter(function(t) { return t.status === "open"; }).sort(function(a,b) { return Number(b.createdAt || 0) - Number(a.createdAt || 0); });
      if (!open.length) {
        list.innerHTML = '<p style="text-align:center; color:var(--muted); font-size:13px">Acik servis yok.</p>';
        return;
      }
      list.innerHTML = open.map(function(t) {
        var p = personnel.find(function(x) { return x.id === t.pId; });
        return '<div class="row"><div><strong>' + esc(t.customer) + '</strong><small>' + esc(p ? p.name : "Personel") + ' - ' +
          esc(t.detail) + '<br>' + esc(t.address || "") + '</small></div><div class="row-actions">' +
          '<button class="btn btn-green" data-id="' + esc(t.id) + '" data-action="admin-complete">Kapat</button>' +
          '<button class="btn btn-red" data-id="' + esc(t.id) + '" data-action="delete-task">Sil</button></div></div>';
      }).join("");
    }

    function renderFeed() {
      var list = $("feed-list");
      var items = feed.slice().sort(function(a,b) { return Number(b.createdAt || 0) - Number(a.createdAt || 0); });
      if (!items.length) {
        list.innerHTML = '<p style="text-align:center; color:var(--muted); font-size:13px">Servis akisi bos.</p>';
        return;
      }
      list.innerHTML = items.map(function(f) {
        return '<div class="row"><div><strong>' + esc(f.title) + '</strong><small>' + esc(f.desc) +
          (f.price ? '<br>Tahsilat: ' + money(f.price) : "") + '</small></div><small>' + formatTime(f.createdAt) + '</small></div>';
      }).join("");
    }

    function renderMapList() {
      var box = $("map-list");
      var open = tasks.filter(function(t) { return t.status === "open"; });
      if (!open.length) {
        box.innerHTML = '<div class="map-pin"><span>Acik servis yok</span><span>Hazir</span></div>';
        return;
      }
      box.innerHTML = open.map(function(t) {
        var p = personnel.find(function(x) { return x.id === t.pId; });
        return '<div class="map-pin"><span><strong>' + esc(t.customer) + '</strong><br>' + esc(p ? p.name : "Personel") +
          '</span><a class="btn btn-light" target="_blank" href="' + mapsUrl(t) + '">Yol Tarifi</a></div>';
      }).join("");
    }

    function renderMobile() {
      var box = $("mobile-tasks");
      if (!activePerson) return;
      var mine = tasks.filter(function(t) { return t.pId === activePerson && t.status === "open"; }).sort(function(a,b) { return Number(b.createdAt || 0) - Number(a.createdAt || 0); });
      if (!mine.length) {
        box.innerHTML = '<article class="card card-pad" style="text-align:center; color:var(--muted)">Bekleyen servis goreviniz yok.</article>';
        return;
      }
      box.innerHTML = mine.map(function(t) {
        return '<article class="card card-pad"><span class="badge badge-red">Yeni Gorev</span><h3>' + esc(t.customer) + '</h3>' +
          (t.phone ? '<a href="tel:' + esc(t.phone) + '" class="badge badge-green">' + esc(t.phone) + '</a>' : "") +
          '<p style="color:var(--muted)">' + esc(t.detail) + '</p>' +
          (t.address ? '<small>' + esc(t.address) + '</small>' : "") +
          '<div style="display:flex; gap:8px; margin-top:12px"><a class="btn btn-light" href="' + mapsUrl(t) + '" target="_blank">Yol Tarifi</a>' +
          '<button class="btn btn-primary" data-id="' + esc(t.id) + '" data-action="open-complete">Tamamla</button></div></article>';
      }).join("");
    }

    function renderCalendar() {
      var box = $("calendar");
      var y = calendarDate.getFullYear();
      var m = calendarDate.getMonth();
      $("calendar-title").textContent = calendarDate.toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
      var first = new Date(y, m, 1);
      var last = new Date(y, m + 1, 0);
      var offset = (first.getDay() + 6) % 7;
      var cells = [];
      var i;
      for (i = 0; i < offset; i++) cells.push('<div class="calendar-cell muted"></div>');
      for (i = 1; i <= last.getDate(); i++) {
        var start = new Date(y, m, i).getTime();
        var end = new Date(y, m, i + 1).getTime();
        var total = sumRevenue(start, end);
        var cls = "calendar-cell" + (total ? " revenue" : "") + (start === todayStart() ? " today" : "");
        cells.push('<div class="' + cls + '"><strong>' + i + '</strong><span>' + (total ? money(total) : "-") + '</span></div>');
      }
      box.innerHTML = cells.join("");
    }

    function renderPayments() {
      var box = $("payment-list");
      var from = monthStart(calendarDate);
      var to = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1).getTime();
      var paid = tasks.filter(function(t) {
        return t.status === "completed" && Number(t.completedAt || 0) >= from && Number(t.completedAt || 0) < to && Number(t.price || 0) > 0;
      }).sort(function(a,b) { return Number(b.completedAt || 0) - Number(a.completedAt || 0); });
      if (!paid.length) {
        box.innerHTML = '<p style="color:var(--muted); font-size:13px">Bu ay icin duzeltilecek tahsilat yok.</p>';
        return;
      }
      box.innerHTML = paid.map(function(t) {
        var p = personnel.find(function(x) { return x.id === t.pId; });
        return '<div class="row"><div><strong>' + esc(t.customer) + ' - ' + money(t.price) + '</strong><small>' +
          esc(p ? p.name : "Personel") + ' - ' + formatDate(t.completedAt) + '</small></div>' +
          '<button class="btn btn-red" data-id="' + esc(t.id) + '" data-action="reset-payment">Sifirla</button></div>';
      }).join("");
    }

    function mapsUrl(t) {
      var q = t.mapLink || t.address || t.customer || "Kiziltepe";
      if (/^https?:\/\//i.test(q)) return q;
      return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
    }

    function openPersonnelModal() { $("personnel-modal").classList.add("show"); }
    function closePersonnelModal() { $("personnel-modal").classList.remove("show"); }
    function openTaskModal() {
      if (!personnel.length) return toast("Once personel ekleyin.", "error");
      $("task-modal").classList.add("show");
    }
    function closeTaskModal() { $("task-modal").classList.remove("show"); }
    function closeCompleteModal() { $("complete-modal").classList.remove("show"); }

    async function savePersonnel() {
      var name = $("p-name").value.trim();
      var username = norm($("p-user").value);
      var password = $("p-pass").value.trim();
      if (!name || !username || !password) return toast("Tum alanlari doldurun.", "error");
      if (personnel.some(function(p) { return norm(p.username) === username; })) return toast("Bu kullanici adi zaten var.", "error");
      try {
        await addDoc("personnel", { name: name, username: username, password: password, status: "Bekliyor", createdAt: Date.now() });
        await addFeed("Personel Eklendi", name + " sisteme eklendi.");
        $("p-name").value = $("p-user").value = $("p-pass").value = "";
        closePersonnelModal();
        await refreshData();
        toast("Personel eklendi.");
      } catch (err) {
        console.error(err);
        toast("Personel kaydedilemedi.", "error");
      }
    }

    function deletePersonnel(id) {
      var p = personnel.find(function(x) { return x.id === id; });
      if (!p) return;
      var related = tasks.filter(function(t) { return t.pId === id; });
      confirmBox(p.name + " ve bagli " + related.length + " servis kaydi silinsin mi?", async function() {
        var i;
        for (i = 0; i < related.length; i++) await deleteDoc("tasks", related[i].id);
        await deleteDoc("personnel", id);
        await addFeed("Personel Silindi", p.name + " silindi.", "danger");
        await refreshData();
        toast("Personel silindi.", "info");
      });
    }

    async function assignTask() {
      var pId = $("t-person").value;
      var p = personnel.find(function(x) { return x.id === pId; });
      if (!p) return toast("Personel secilemedi.", "error");
      var task = {
        pId: pId,
        customer: $("t-customer").value.trim() || "Bilinmeyen Musteri",
        phone: $("t-phone").value.trim(),
        detail: $("t-detail").value.trim() || "Ariza kontrolu",
        address: $("t-address").value.trim(),
        mapLink: $("t-map").value.trim(),
        status: "open",
        price: 0,
        createdAt: Date.now()
      };
      try {
        await addDoc("tasks", task);
        await patchDoc("personnel", pId, { status: "Sahada", updatedAt: Date.now() });
        await addFeed("Gorev Atandi", p.name + " personeline " + task.customer + " gorevi verildi.");
        ["t-customer","t-phone","t-detail","t-address","t-map"].forEach(function(id) { $(id).value = ""; });
        closeTaskModal();
        await refreshData();
        toast("Gorev gonderildi.");
      } catch (err) {
        console.error(err);
        toast("Gorev kaydedilemedi.", "error");
      }
    }

    function openComplete(id) {
      var t = tasks.find(function(x) { return x.id === id; });
      if (!t) return;
      $("c-task").value = id;
      $("c-title").textContent = t.customer;
      $("c-note").value = "";
      $("c-price").value = "";
      $("complete-modal").classList.add("show");
    }

    async function completeTask() {
      var id = $("c-task").value;
      var t = tasks.find(function(x) { return x.id === id; });
      var note = $("c-note").value.trim();
      var price = Number($("c-price").value || 0);
      if (!t) return;
      if (!note) return toast("Yapilan islemi yazin.", "error");
      try {
        await patchDoc("tasks", id, { status: "completed", note: note, price: price, completedAt: Date.now() });
        await maybeIdle(t.pId, id);
        var p = personnel.find(function(x) { return x.id === t.pId; });
        await addFeed("Servis Tamamlandi", (p ? p.name : "Personel") + ", " + t.customer + " servisini kapatti.", "success", price);
        closeCompleteModal();
        await refreshData();
        toast("Servis tamamlandi.");
      } catch (err) {
        console.error(err);
        toast("Servis kapatilamadi.", "error");
      }
    }

    function adminCompleteTask(id) {
      var t = tasks.find(function(x) { return x.id === id; });
      if (!t) return;
      confirmBox(t.customer + " servisi 0 TL tahsilatla kapatilsin mi?", async function() {
        await patchDoc("tasks", id, { status: "completed", note: "Admin tarafindan kapatildi.", price: 0, completedAt: Date.now() });
        await maybeIdle(t.pId, id);
        await addFeed("Servis Kapatildi", t.customer + " servisi admin tarafindan kapatildi.", "success", 0);
        await refreshData();
      });
    }

    function deleteTask(id) {
      var t = tasks.find(function(x) { return x.id === id; });
      if (!t) return;
      confirmBox(t.customer + " acik servisi silinsin mi?", async function() {
        await deleteDoc("tasks", id);
        await maybeIdle(t.pId, id);
        await addFeed("Servis Silindi", t.customer + " acik servisi silindi.", "danger");
        await refreshData();
        toast("Servis silindi.", "info");
      });
    }

    function closeAllOpenTasks() {
      var open = tasks.filter(function(t) { return t.status === "open"; });
      if (!open.length) return toast("Acik servis yok.", "info");
      confirmBox(open.length + " acik servis 0 TL tahsilatla kapatilsin mi?", async function() {
        var i;
        for (i = 0; i < open.length; i++) {
          await patchDoc("tasks", open[i].id, { status: "completed", note: "Admin tarafindan toplu kapatildi.", price: 0, completedAt: Date.now() });
        }
        for (i = 0; i < personnel.length; i++) {
          await patchDoc("personnel", personnel[i].id, { status: "Bekliyor", updatedAt: Date.now() });
        }
        await addFeed("Acik Servisler Kapatildi", open.length + " servis toplu kapatildi.", "success");
        await refreshData();
      });
    }

    async function maybeIdle(personId, closingTask) {
      var still = tasks.some(function(t) { return t.id !== closingTask && t.pId === personId && t.status === "open"; });
      if (!still && personId) await patchDoc("personnel", personId, { status: "Bekliyor", updatedAt: Date.now() });
    }

    async function addFeed(title, desc, type, price) {
      await addDoc("feed", { title: title, desc: desc, type: type || "new", price: Number(price || 0), createdAt: Date.now() });
    }

    function clearFeed() {
      if (!feed.length) return toast("Temizlenecek akis yok.", "info");
      confirmBox("Servis akisi temizlensin mi?", async function() {
        var i;
        for (i = 0; i < feed.length; i++) await deleteDoc("feed", feed[i].id);
        await refreshData();
        toast("Akis temizlendi.", "info");
      });
    }

    function clearAllData() {
      confirmBox("Tum personel, servis ve akis kayitlari silinsin mi? Bu islem geri alinamaz.", async function() {
        var i;
        for (i = 0; i < personnel.length; i++) await deleteDoc("personnel", personnel[i].id);
        for (i = 0; i < tasks.length; i++) await deleteDoc("tasks", tasks[i].id);
        for (i = 0; i < feed.length; i++) await deleteDoc("feed", feed[i].id);
        await refreshData();
        toast("Tum veriler temizlendi.", "info");
      }, "TEMIZLE");
    }

    function openResetPayment(id) {
      var t = tasks.find(function(x) { return x.id === id; });
      if (!t || !t.price) return;
      resetTaskId = id;
      $("reset-text").textContent = t.customer + " kaydindaki " + money(t.price) + " tahsilat 0 TL yapilacak. Servis silinmez.";
      $("reset-code").value = "";
      $("reset-modal").classList.add("show");
      setTimeout(function() { $("reset-code").focus(); }, 50);
    }

    function closeResetModal() { $("reset-modal").classList.remove("show"); }

    async function confirmResetPayment() {
      if ($("reset-code").value.trim().toUpperCase() !== "SIFIRLA") return toast("Onay icin SIFIRLA yazin.", "error");
      var t = tasks.find(function(x) { return x.id === resetTaskId; });
      if (!t) return closeResetModal();
      try {
        await patchDoc("tasks", t.id, { originalPrice: Number(t.originalPrice || t.price || 0), price: 0, priceCorrectedAt: Date.now() });
        await addFeed("Tahsilat Duzeltildi", t.customer + " servisindeki " + money(t.price) + " tahsilat 0 TL yapildi.", "danger");
        closeResetModal();
        await refreshData();
        toast("Tahsilat sifirlandi.", "info");
      } catch (err) {
        console.error(err);
        toast("Tahsilat duzeltilemedi.", "error");
      }
    }

    function changeMonth(n) {
      calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + n, 1);
      renderCalendar();
      renderPayments();
    }

    function confirmBox(message, callback, code) {
      confirmCallback = callback;
      $("confirm-text").textContent = message;
      $("confirm-code-wrap").classList.toggle("hidden", !code);
      $("confirm-code").value = "";
      $("confirm-code").placeholder = code || "";
      $("confirm-code-label").textContent = code ? "Onay icin " + code + " yazin" : "Onay kodu";
      $("confirm-modal").classList.add("show");
      $("confirm-ok").onclick = async function() {
        if (code && $("confirm-code").value.trim().toUpperCase() !== code) {
          toast("Onay icin " + code + " yazin.", "error");
          return;
        }
        closeConfirm();
        try { await confirmCallback(); }
        catch (err) { console.error(err); toast("Islem tamamlanamadi.", "error"); }
      };
    }

    function closeConfirm() {
      $("confirm-modal").classList.remove("show");
      confirmCallback = null;
    }

    function formatTime(v) {
      return v ? new Date(Number(v)).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "--:--";
    }

    function formatDate(v) {
      return v ? new Date(Number(v)).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";
    }

    window.onerror = function(message, source, line) {
      console.error(message, source, line);
      toast("Sayfada hata yakalandi; ekran acik tutuldu.", "error");
      return false;
    };

    function boot() {
      if ($("hard-fallback")) $("hard-fallback").classList.add("hidden");
      $("clock").textContent = formatTime(Date.now());
      setInterval(function() { $("clock").textContent = formatTime(Date.now()); }, 1000);
      renderAll();
      signInCloud();
    }

    document.addEventListener("click", function(event) {
      var btn = event.target.closest("[data-action]");
      if (!btn) return;
      var id = btn.getAttribute("data-id");
      var action = btn.getAttribute("data-action");
      if (action === "delete-personnel") deletePersonnel(id);
      if (action === "admin-complete") adminCompleteTask(id);
      if (action === "delete-task") deleteTask(id);
      if (action === "open-complete") openComplete(id);
      if (action === "reset-payment") openResetPayment(id);
    });

    document.addEventListener("DOMContentLoaded", boot);
