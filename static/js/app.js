

const UserColors = ['#eb4b54', '#4db02d', '#2c81c0', '#8264f2', '#ea5296', '#29b2b5', '#fb9553'];
//Telegram.WebApp.MainButton.onClick(app.onMainButton);
//Telegram.WebApp.BackButton.onClick(app.onBackButton);

const FirstDay = 1; // Detect?

function ce(className, parentEl = null ) {
  const el = document.createElement('div');
  el.className = className;
  parentEl && parentEl.appendChild(el);
  return el;
}

async function api(endpoint, params = {}) {
  return (await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(Object.assign({
      initData: Telegram.WebApp.initData,
    }, params)),
  })).json();
}

function getMonth(date) {
  const m = date.toLocaleString('default', { month: 'long' });
  return m[0].toLocaleUpperCase() + m.substring(1);
}

function updateRange(day, range) {
  const stEl = day.hours[range.st].el;
  const enEl = day.hours[range.en].el;
  range.el.style.left = stEl.offsetLeft + 'px';
  range.el.style.width = (enEl.offsetLeft + enEl.offsetWidth - stEl.offsetLeft) + 'px';
}

function makeDirty(dates) {
  Telegram.WebApp.MainButton.show();
}

function buildHandle(day, myDay, range, isLeft) {
  let minH, maxH;
  let events;
  function onDragStart(ev) {
    minH = 0;
    maxH = day.hours.length - 1;
    if (isLeft) {
      maxH = range.en;
      for (let r of myDay.ranges) {
        if (r.st < range.st) {
          minH = Math.max(minH, r.en + 1);
        }
      }
    } else {
      minH = range.st;
      for (let r of myDay.ranges) {
        if (r.en > range.en) {
          maxH = Math.min(maxH, r.st - 1);
        }
      }
    }
    events = ev.touches ? ['touchmove', 'touchend'] : ['mousemove', 'mouseup'];
    document.addEventListener(events[0], onDragMove, { passive: false });
    document.addEventListener(events[1], onDragEnd);
    ev.preventDefault();
    ev.stopPropagation();
  }
  function onDragMove(ev) {
    const sx = day.hoursEl.scrollLeft;
    let [x, y] = ev.touches ? [sx + ev.touches[0].clientX, ev.touches[0].clientY] : [sx + ev.clientX, ev.clientY];
    let closest = null;
    for (let h = minH; h <= maxH; h++) {
      const left = day.hours[h].el.offsetLeft;
      const right = left + day.hours[h].el.offsetWidth;
      const dist = isLeft ? Math.abs(left - x) : Math.abs(right - x);
      if (!closest || closest.dist > dist) {
        closest = { dist, h, x: isLeft ? left : right };
      }
    }
    if (closest) {
      if (range[isLeft ? 'st' : 'en'] != closest.h) {
        range[isLeft ? 'st' : 'en'] = closest.h;
        updateRange(day, range);
        updateDayBar(day);
        Telegram.WebApp.HapticFeedback.selectionChanged();
        makeDirty(true);
      }
    }
    ev.preventDefault();
    ev.stopPropagation();
  }
  function onDragEnd(ev) {
    for (let i = 0; i < myDay.ranges.length; i++) {
      if ((range.st == myDay.ranges[i].en + 1) || (range.en == myDay.ranges[i].st - 1)) {
        if (range.st == myDay.ranges[i].en + 1) {
          range.st = myDay.ranges[i].st;
        } else {
          range.en = myDay.ranges[i].en;
        }
        myDay.ranges[i].el.remove();
        myDay.ranges.splice(i, 1);
        updateRange(day, range);
        break;
      }
    }
    updateDayBar(day);
    updateButtons(day);
    document.removeEventListener(events[0], onDragMove, { passive: false });
    document.removeEventListener(events[1], onDragEnd);
  }
  const el = ce('calendar__range-handle is-' + (isLeft ? 'left' : 'right'), range.el);
  el.addEventListener('mousedown', onDragStart);
  el.addEventListener('touchstart', onDragStart, { passive: false });
}

function areRangesEqual(ranges1, ranges2) {
  if (ranges1.length != ranges2.length) {
    return false;
  }
  ranges1 = ranges1.slice(0);
  ranges1.sort((a, b) => (a.st == b.st) ? (b.en - a.en) : (b.st - a.st));
  ranges2 = ranges2.slice(0);
  ranges2.sort((a, b) => (a.st == b.st) ? (b.en - a.en) : (b.st - a.st));
  for (let i = 0; i < ranges1.length; i++) {
    if (ranges1[i].st != ranges2[i].st || ranges1[i].en != ranges2[i].en) {
      return false;
    }
  }
  return true;
}

function isFullDaySelected(day) {
  const date = day.date;
  const dayId = date.getDate() + '.' + (date.getMonth() + 1) + '.' + date.getFullYear();
  const myDay = myDates[dayId] || { ranges: [] };
  const def = myDates.default || { ranges: [{ st: 0, en: 23 }] };
  return areRangesEqual(myDay.ranges, def.ranges);
}

function updateButtons(day) {
  const date = day.date;
  const dayId = date.getDate() + '.' + (date.getMonth() + 1) + '.' + date.getFullYear();
  const myDay = myDates[dayId] || { ranges: [] };
  const isFullSelected = isFullDaySelected(day);
  const isSaveDisabled = isFullSelected || (myDay.ranges.length == 0);
  if (isFullSelected) {
    day.fullBtn.innerText = 'Deselect Day';
  } else {
    day.fullBtn.innerText = 'Select Full Day';
  }
  if (isSaveDisabled) {
    day.saveBtn.setAttribute('disabled', true);
  } else {
    day.saveBtn.removeAttribute('disabled');
  }
}

function buildDayBox(day, weekDay) {
  const date = day.date;
  const dayId = date.getDate() + '.' + (date.getMonth() + 1) + '.' + date.getFullYear();

  const dayBoxEl = ce('calendar__day-box');
  dayBoxEl.style.setProperty('--arrow-pos', ((weekDay * 2 + 1) * 100 / 14) + '%');
  const hoursEl = ce('calendar__day-hours', dayBoxEl);
  const hoursNoteEl = ce('calendar__day-note', hoursEl);
  hoursNoteEl.innerText = 'Your availability:';
  const hoursSelectEl = ce('calendar__day-hours-select', hoursEl);
  for (let k = 0; k <= 23; k++) {
    const hour = k;
    const hourEl = ce('calendar__day-hour', hoursSelectEl);
    hourEl.classList.toggle('is-small', k % 3 != 0);
    hourEl.innerText = (k == 24 ? '00:00' : (k.toString().padStart(2, '0') + ':00'));
    hourEl.addEventListener('click', () => {
      const myDay = myDates[dayId] || { ranges: [] };
      if (!myDates[dayId]) {
        myDates[dayId] = myDay;
      }

      const ranges = myDay.ranges;
      let found = false;
      for (let i = 0; i < ranges.length; i++) {
        const range = ranges[i];
        if (found) { // Already found a range, but maybe merge with another
          if (found.st == range.en + 1) {
            found.st = range.st;
            range.el && range.el.remove();
            ranges.splice(i, 1);
            break;
          }
          if (found.en == range.st - 1) {
            found.en = range.en;
            range.el && range.el.remove();
            ranges.splice(i, 1);
            break;
          }
        } else
        if ((range.st <= hour && range.en >= hour) || (range.st == hour + 1) || (range.en == hour - 1)) {
          found = true;
          if (range.st == hour + 1) {
            range.st = hour;
            found = range;
            continue;
          } else
          if (range.en == hour - 1) {
            range.en = hour;
            found = range;
            continue;
          } else
          if (range.st == hour && range.en == hour) {
            range.el && range.el.remove();
            ranges.splice(i, 1);
          } else
          if (range.st == hour) {
            range.st = hour + 1;
          } else
          if (range.en == hour) {
            range.en = hour - 1;
          } else {
            ranges.push({ st: hour + 1, en: range.en });
            range.en = hour - 1;
          }
          break;
        }
      }
      if (!found) {
        ranges.push({ st: hour, en: hour });
      }
      
      Telegram.WebApp.HapticFeedback.selectionChanged();
      makeDirty(true);
      
      for (let range of ranges) {
        if (!range.el) {
          range.el = ce('calendar__range', hoursSelectEl);
          buildHandle(day, myDay, range, false);
          buildHandle(day, myDay, range, true);
        }

        updateRange(day, range);
      }
      updateButtons(day);
      updateDayBar(day);
    });
    day.hours.push({ el: hourEl });
  }
  day.dayBoxEl = dayBoxEl;
  day.hoursEl = hoursEl;
  day.hoursSelectEl = hoursSelectEl;

  const buttonsEl = ce('calendar__day-buttons', hoursEl);

  const fullBtn = ce('calendar__day-button', buttonsEl);
  fullBtn.innerText = 'Select Full Day';
  fullBtn.addEventListener('click', () => {
    const myDay = myDates[dayId] || { ranges: [] };
    for (let range of myDay.ranges) {
      range.el && range.el.remove();
    }

    if (isFullDaySelected(day)) {
      myDay.ranges = [];
    } else {
      const def = myDates.default || { ranges: [{ st: 0, en: 23 }] };
      if (!myDates[dayId]) {
        myDates[dayId] = myDay;
      }
      myDay.ranges = def.ranges.map(rng => { return { st: rng.st, en: rng.en } });
    }
    for (let range of myDay.ranges) {
      if (!range.el) {
        range.el = ce('calendar__range', hoursSelectEl);
        buildHandle(day, myDay, range, false);
        buildHandle(day, myDay, range, true);
      }
      updateRange(day, range);
    }
    updateDayBar(day);
    updateButtons(day);
    makeDirty();
    Telegram.WebApp.HapticFeedback.impactOccurred('medium');
  });

  const saveBtn = ce('calendar__day-button', buttonsEl);
  saveBtn.innerText = 'Save As Full Day';
  saveBtn.addEventListener('click', () => {
    if (saveBtn.hasAttribute('disabled')) {
      return;
    }
    const myDay = myDates[dayId] || { ranges: [] };
    myDates.default = {
      ranges: myDay.ranges.map(rng => { return { st: rng.st, en: rng.en } })
    }
    updateButtons(day);
    makeDirty();
    Telegram.WebApp.HapticFeedback.impactOccurred('medium');
  });

  day.fullBtn = fullBtn;
  day.saveBtn = saveBtn;
  updateButtons(day);

  const hasOthers = event.participants.filter(user => user.id != me.id && user.dates && user.dates[dayId] && user.dates[dayId].ranges.length).length > 0;
  const othersNoteEl = ce('calendar__day-note', hoursEl);
  othersNoteEl.style.marginBottom = hasOthers ? '8px' : '0px';
  othersNoteEl.innerText = hasOthers ? 'Other participants:' : 'Nobody else is available on this day';

  const userRowEls = [];
  const rangeEls = [];
  for (let user of event.participants) {
    if (user.id == me.id) {
      continue;
    }
    const userDay = user.dates ? user.dates[dayId] : null;
    if (!userDay || !userDay.ranges.length) {
      continue;
    }

    const userRowEl = ce('calendar__user-row', hoursEl);
    userRowEl.style.setProperty('--user-color', UserColors[user.id % UserColors.length]);
    
    for (let range of userDay.ranges) {
      const rangeEl = ce('calendar__user-range', userRowEl);
      rangeEls.push({ rangeEl, range });
    }

    const userNameEl = ce('calendar__user-name', userRowEl);
    userNameEl.innerText = user.first_name + (user.last_name ? ' ' + user.last_name : '');
    userRowEls.push(userRowEl);
  }

  // update sizes after measure
  setTimeout(() => {
    for (let userRowEl of userRowEls) {
      userRowEl.style.width = hoursSelectEl.scrollWidth + 'px';
    }
    for (let { rangeEl, range } of rangeEls) {
      const stEl = day.hours[range.st].el;
      const enEl = day.hours[range.en].el;
      rangeEl.style.left = stEl.offsetLeft + 'px';
      rangeEl.style.width = (enEl.offsetLeft + enEl.offsetWidth - stEl.offsetLeft) + 'px';
    }
    
    if (myDates[dayId]) {
      const myDay = myDates[dayId];
      const ranges = myDay.ranges;
      for (let range of ranges) {
        if (!range.el) {
          range.el = ce('calendar__range', hoursSelectEl);
          buildHandle(day, myDay, range, false);
          buildHandle(day, myDay, range, true);
        }
        updateRange(day, range);
      }
    }
  }, 0);
}

function updateDayBar(day) {
  const date = day.date;
  const total = event.participants.length + 1;
  const counts = new Array(24);
  counts.fill(0);
  let hasAny = false;
  for (let user of event.participants) {
    const userDay = user.dates ? user.dates[date.getDate() + '.' + (date.getMonth() + 1) + '.' + date.getFullYear()] : null;
    if (userDay) {
      for (let range of userDay.ranges) {
        for (let h = range.st; h <= range.en; h++) {
          counts[h]++;
          hasAny = true;
        }
      }
    }
  }
  
  const myDay = myDates ? myDates[date.getDate() + '.' + (date.getMonth() + 1) + '.' + date.getFullYear()] : null;
  if (myDay) {
    for (let range of myDay.ranges) {
      for (let h = range.st; h <= range.en; h++) {
        counts[h]++;
        hasAny = true;
      }
    }
  }

  day.barEl.classList.toggle('is-hidden', !hasAny);
  if (!hasAny) {
    return;
  }

  if (!day.blockEls) {
    day.blockEls = [];
    for (let h = 0; h < 24; h++) {
      day.blockEls.push(ce('calendar__day-block', day.barEl));
    }
  }
  for (let h = 0; h < 24; h++) {
    day.blockEls[h].style.setProperty('--ratio', counts[h] / total);
  }
}

function buildDay(weekEl, date, week, weekDay) {
  const day = {
    date, week, weekDay, hours: [],
  };
  day.el = ce('calendar__day', weekEl);
  day.el.innerText = date.getDate();
  day.el.classList.toggle('is-this-month', (date.getFullYear() == currentMonth[0]) && (date.getMonth() == currentMonth[1]));
  day.el.addEventListener('click', () => {
    if (activeDayBox) {
      activeDayBox.remove();
    }
    if (activeDayEl) {
      activeDayEl.classList.remove('is-active');
    }
    
    Telegram.WebApp.HapticFeedback.selectionChanged();

    if (day.dayBoxEl === activeDayBox) {
      activeDayBox = null;
      return;
    }
    if (!day.dayBoxEl) {
      buildDayBox(day, weekDay);
    }
    activeDayBox = day.dayBoxEl;
    activeDayEl = day.el;
    activeDayEl.classList.add('is-active');
    weekEl.parentNode.insertBefore(activeDayBox, weekEl.nextElementSibling);
    const hoursEl = day.hoursEl;
    hoursEl.scrollLeft = 0.885 * (hoursEl.scrollWidth - hoursEl.clientWidth);
  });

  day.barEl = ce('calendar__day-bar', day.el);
  updateDayBar(day);
  return day;
}

function buildCalendar() {
  const el = document.getElementById('calendar');

  let today = new Date();
  currentMonth = [today.getFullYear(), today.getMonth()];

  let date = today;
  while (date.getDay() != FirstDay) {
    date = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
  }

  const headEl = ce('calendar__head', el);
  const bodyEl = ce('calendar__body', el);

  const infoEl = ce('info-box', headEl);
  infoEl.innerHTML = `<p>This event is in <b>voting mode</b>.</p><p>Click on days and highlight hours <b>when you will be available</b>.</p>`;

  const monthNameEl = ce('calendar__month-name', headEl);
  monthNameEl.innerText = getMonth(date) + ' ' + date.getFullYear();
  const weekNamesEl = ce('calendar__week-names', headEl);
  for (let i = 0; i < 7; i++) {
    const weekDayEl = ce('calendar__week-day', weekNamesEl);
    weekDayEl.innerText = (new Date(2023, 9, i + FirstDay + 8)).toLocaleString('default', { weekday: 'short' });
  }

  const weekRows = [];
  const days = [];
  for (let i = 0; i < 16; i++) {
    const weekEl = ce('calendar__week', bodyEl);
    const firstDate = date;
    for (let j = 0; j < 7; j++) {
      days.push(buildDay(weekEl, date, i, j));
      date = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    }
    weekRows.push({ el: weekEl, date: firstDate });
  }

  return { el, headEl, monthNameEl, weekRows, days };
}

function buildParticipant(user) {
  const userEl = ce('participants__user', document.getElementById('participants'));
  const firstNameEl = document.createElement('b');
  firstNameEl.innerText = user.first_name;
  userEl.appendChild(firstNameEl);
  if (user.last_name) {
    const lastNameEl = document.createElement('span');
    lastNameEl.innerText = ' ' + user.last_name;
    userEl.appendChild(lastNameEl);
  }
  if (user.id == me.id) {
    const itsYouEl = document.createElement('span');
    itsYouEl.classList.add('is-weak');
    itsYouEl.innerText = ' (you)';
    userEl.appendChild(itsYouEl);
    myUserEl = userEl;
  }
  return userEl;
}

function buildParticipants() {
  for (let user of event.participants) {
    if (user.state <= 0) {
      continue;
    }
    buildParticipant(user);
  }
}

async function init() {
  event = await api('event', { id: Telegram.WebApp.initDataUnsafe.start_param });
  isJoined = false;
  for (let user of event.participants) {
    if (user.id == me.id && user.state != 0) {
      myDates = user.dates;
      if (!myDates) {
        myDates = {};
        user.dates = myDates;
      }
      for (let dayId in myDates) { // TODO: this is a hack, should be fixed properly
        for (let range of myDates[dayId].ranges) {
          delete range.el;
        }
      }
      isJoined = true;
    }
  }
  /*event.participants = [{ // mock temporarily
    id: 888351,
    first_name: 'Denis',
    dates: {
      '12.10.2023': {
        ranges: [{
          st: 7, en: 15
        }]
      }
    }
  }, {
    id: 12345,
    first_name: 'Grishka',
    dates: {
      '12.10.2023': {
        ranges: [{
          st: 10, en: 12
        }, {
          st: 16, en: 20
        }]
      }
    }
  }, {
    id: 54321,
    first_name: 'Aleksei',
    dates: {
      '12.10.2023': {
        ranges: [{
          st: 2, en: 22
        }]
      }
    }
  }];*/
  calendar = buildCalendar();
  buildParticipants();
  titleEl.value = event.title || '';
  descriptionEl.value = event.description || '';
  if (event.owner_id != me.id) {
    titleEl.readOnly = true;
    descriptionEl.readOnly = true;
  } else {
    titleEl.addEventListener('input', () => {
      event.title = titleEl.value;
      makeDirty();
    });
    descriptionEl.addEventListener('input', () => {
      event.description = descriptionEl.value;
      makeDirty();
    });
  }
  updateStatus();
  console.log(event);
}

function updateStatus() {
  if (event.owner_id != me.id) {
    if (!isJoined) {
      Telegram.WebApp.MainButton.show();
      Telegram.WebApp.MainButton.text = 'Join Event';
      statusEl.innerHTML = `You are not participating in this event.<br/>Press "Join Event" to participate.`;
    } else {
      Telegram.WebApp.MainButton.hide();
      Telegram.WebApp.MainButton.text = 'Save Dates';
      statusEl.innerHTML = `You are participating in this event. If you want to stop participating, <a href="javascript:" onclick="leave()">leave this event</a>.`;
    }
  } else {
    Telegram.WebApp.MainButton.text = 'Save Event';
    statusEl.innerHTML = `You are the owner of this event. You can update its title, description and other settings.`;
  }
}

async function onButtonClick() {
  if (activeDayBox) {
    activeDayBox.remove();
  }
  if (activeDayEl) {
    activeDayEl.classList.remove('is-active');
  }
  Telegram.WebApp.HapticFeedback.selectionChanged();
  Telegram.WebApp.MainButton.showProgress();
  if (event.owner_id != me.id) {
    // Join
    await api('join', { id: Telegram.WebApp.initDataUnsafe.start_param, state: 2, dates: myDates });
    if (!isJoined) {
      isJoined = true;
      buildParticipant(me);
    }
    updateStatus();
  } else {
    await api('event', { id: Telegram.WebApp.initDataUnsafe.start_param, event });
    await api('join', { id: Telegram.WebApp.initDataUnsafe.start_param, state: 1, dates: myDates });
  }
  Telegram.WebApp.MainButton.hideProgress();
  Telegram.WebApp.MainButton.hide();
}

function onTabClick(tabId) {
  for (let id of ['calendar', 'participants']) {
    document.getElementById(`tab-${id}`).classList.toggle('is-active', id == tabId);
    document.getElementById(id).classList.toggle('is-hidden', id != tabId);
  }
  Telegram.WebApp.HapticFeedback.selectionChanged();
}

async function leave() {
  await api('join', { id: Telegram.WebApp.initDataUnsafe.start_param, state: 0, dates: myDates });
  isJoined = false;
  myUserEl && myUserEl.remove();
  myUserEl = null;
  updateStatus();
}

const titleEl = document.getElementById('title');
const descriptionEl = document.getElementById('description');
const statusEl = document.getElementById('info-status');
const me = Telegram.WebApp.initDataUnsafe.user;
let event = null;
let isJoined;
let currentMonth = [0, 0];
let activeDayEl = null;
let activeDayBox = null;
let calendar = null;
let myDates = {};
let myUserEl = null;

document.addEventListener('scroll', (event) => {
  lastKnownScrollPosition = window.scrollY;

  const topY = calendar.headEl.getBoundingClientRect().bottom;
  for (let row of calendar.weekRows) {
    const y = row.el.getBoundingClientRect().top;
    if (y >= topY) {
      let date = row.date;
      if (date.getDate() > 12) {
        date = new Date(date.getFullYear(), date.getMonth() + 1, 1);
      }
      currentMonth = [date.getFullYear(), date.getMonth()];
      calendar.monthNameEl.innerText = getMonth(date) + ' ' + date.getFullYear();
      for (let day of calendar.days) {
        day.el.classList.toggle('is-this-month', (day.date.getFullYear() == currentMonth[0]) && (day.date.getMonth() == currentMonth[1]));
      }
      break;
    }
  }
});
document.getElementById('head').addEventListener('submit', (ev) => {
  document.activeElement.blur();
  ev.preventDefault();
});
document.getElementById('tab-calendar').addEventListener('click', onTabClick.bind(null, 'calendar'));
document.getElementById('tab-participants').addEventListener('click', onTabClick.bind(null, 'participants'));
document.body.classList.add('is-' + Telegram.WebApp.colorScheme);
Telegram.WebApp.MainButton.onClick(onButtonClick);
init();