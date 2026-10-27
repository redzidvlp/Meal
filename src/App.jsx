import { useEffect, useMemo, useState } from "react";
import { T } from "./data/translations.js";
import { interpolate, todayIndex } from "./lib/format.js";
import { useAppData } from "./hooks/useAppData.js";
import { usePwaUpdate } from "./hooks/usePwaUpdate.js";
import { useVersionGate } from "./hooks/useVersionGate.js";
import AuthScreen from "./components/AuthScreen.jsx";
import SetupScreen from "./components/SetupScreen.jsx";
import PlanTab from "./components/PlanTab.jsx";
import SuggestionsTab from "./components/SuggestionsTab.jsx";
import ShoppingTab from "./components/ShoppingTab.jsx";
import PantryTab from "./components/PantryTab.jsx";
import TipsTab from "./components/TipsTab.jsx";
import SettingsSheet from "./components/SettingsSheet.jsx";
import RecipeModal from "./components/RecipeModal.jsx";
import RecipeEditor from "./components/RecipeEditor.jsx";
import PhotoSheet from "./components/PhotoSheet.jsx";
import MenuEditor from "./components/MenuEditor.jsx";
import { menuItemsFromDay } from "./lib/menus.js";
import RecipePicker from "./components/RecipePicker.jsx";
import { EmptyState, Toast } from "./components/ui.jsx";
import ConnectionScreen, { SchemaNotice } from "./components/ConnectionScreen.jsx";
import { setOverrideDemo } from "./lib/errors.js";
import "./styles.css";

const TABS = [
  { id: "plan", icon: "🗓️" },
  { id: "suggest", icon: "✨" },
  { id: "shopping", icon: "🛒" },
  { id: "pantry", icon: "🥫" },
  { id: "tips", icon: "🌿" },
];

function LoadingScreen({ t, label, onDemo }) {
  // Silence for more than a few seconds looks like a frozen app, so say what is
  // happening instead of spinning quietly.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSlow(true), 5000);
    return () => clearTimeout(id);
  }, []);
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="loading-mark" aria-hidden="true">🌿</div>
      <div className="spinner" aria-hidden="true" />
      <div>{label || t.loading}</div>
      {slow && <p className="loading-slow">{t.loadingSlow}</p>}
      {slow && onDemo && (
        <button type="button" className="btn btn-sm btn-soft" onClick={onDemo}>{t.connectionDemo}</button>
      )}
    </div>
  );
}

/**
 * Blocks the app until the person chooses. The new build is already downloaded
 * and waiting, but the old one keeps running — and the week, pantry and shopping
 * list keep their current values — until "Update now" is tapped on purpose.
 */
function UpdateGate({ t, onUpdate, onLater }) {
  return (
    <div className="update-gate" role="dialog" aria-modal="true" aria-labelledby="update-title">
      <div className="update-gate-card">
        <div className="update-gate-mark" aria-hidden="true">✨</div>
        <h2 className="update-gate-title" id="update-title">{t.updateTitle}</h2>
        <p className="update-gate-body">{t.updateBody}</p>
        <button type="button" className="btn btn-primary btn-block" onClick={onUpdate}>{t.updateNow}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onLater}>{t.updateLater}</button>
        <p className="tiny" style={{ textAlign: "center", margin: 0 }}>{t.updateHold}</p>
      </div>
    </div>
  );
}

/** Cold-start twin of UpdateGate: the new build is already running, but the
 *  person is asked before the kitchen appears. */
function VersionGate({ t, onAccept, onLater }) {
  return (
    <div className="update-gate" role="dialog" aria-modal="true" aria-labelledby="version-title">
      <div className="update-gate-card">
        <div className="update-gate-mark" aria-hidden="true">🌿</div>
        <h2 className="update-gate-title" id="version-title">{t.versionReadyTitle}</h2>
        <p className="update-gate-body">{t.versionReadyBody}</p>
        <button type="button" className="btn btn-primary btn-block" onClick={onAccept}>{t.versionOpen}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onLater}>{t.updateLater}</button>
      </div>
    </div>
  );
}

export default function App() {
  const [lang, setLang] = useState("en");
  const t = T[lang];
  const app = useAppData(t);
  const pwa = usePwaUpdate();
  const version = useVersionGate(!pwa.needRefresh && !!app.household);
  const todayIdx = todayIndex();
  const [tab, setTab] = useState("plan");
  const [day, setDay] = useState(todayIdx);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewer, setViewer] = useState(null);
  const [viewerContext, setViewerContext] = useState(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanDay, setScanDay] = useState(null);
  const [menuEditor, setMenuEditor] = useState({ open: false, menu: null });
  const [editor, setEditor] = useState({ open: false, recipe: null, slot: null, context: null });
  const [picker, setPicker] = useState({ open: false, day: todayIdx, slot: null, mode: "empty", person: null, initialTab: "recipes" });

  const pickerEntry = picker.open ? app.plan[picker.day]?.[picker.slot] : null;
  const pickerCurrent = picker.person ? pickerEntry?.recipes?.[picker.person] : pickerEntry?.recipes?.R;

  const tabLabels = useMemo(() => ({
    plan: t.navPlan,
    suggest: t.navSuggest,
    shopping: t.navShopping,
    pantry: t.navPantry,
    tips: t.navTips,
  }), [t]);

  const applyRecipeTo = async (context, recipe) => {
    if (!context?.slot) return;
    const { day: targetDay, slot, mode, person } = context;
    try {
      if (mode === "split" && person) {
        const entry = app.plan[targetDay]?.[slot];
        const other = person === "R" ? "I" : "R";
        const rows = [{ personKey: person, recipeId: recipe.id }];
        if (entry?.recipes?.[other]) rows.push({ personKey: other, recipeId: entry.recipes[other].id });
        await app.setSlot(targetDay, slot, rows);
      } else {
        await app.setMeal(targetDay, slot, recipe.id, "both");
      }
    } catch {
      // app.setSlot already surfaced the error.
    }
  };

  const openViewer = (recipe, context = null) => {
    setViewer(recipe);
    setViewerContext(context);
  };

  const openPicker = (context) => {
    setPicker({
      open: true,
      day: context.day ?? day,
      slot: context.slot ?? null,
      mode: context.mode ?? "empty",
      person: context.person ?? null,
      initialTab: context.initialTab || "recipes",
    });
  };

  const handleScanResult = result => {
    const hour = new Date().getHours();
    const slot = hour < 11 ? "breakfast" : hour < 15 ? "lunch" : hour < 18 ? "snack" : "dinner";
    const ingredientName = result.name || t.scanMeal;
    // Opened from the plan, so the meal is saved into that day: the camera sits
    // next to the day menu, and a photo that only lands in the recipe book
    // looks like it did nothing.
    const targetDay = scanDay ?? day;
    setEditor({
      open: true,
      recipe: {
        isDraft: true,
        name: { en: result.name || t.scanMeal, lt: "" },
        emoji: "📷",
        slot,
        kcal: result.kcal,
        protein: result.protein,
        carbs: result.carbs,
        fat: result.fat,
        prepMinutes: 10,
        ingredients: [{ en: ingredientName, lt: "", amount: result.portionGrams || 1, unit: result.portionGrams ? "g" : "vnt" }],
        method: { en: "", lt: "" },
        tags: ["vegetarian"],
      },
      slot,
      context: { day: targetDay, slot, mode: "both", person: null },
    });
    setScanOpen(false);
    setScanDay(null);
  };

  const openNewRecipe = context => {
    const nextContext = context || (picker.open ? { day: picker.day, slot: picker.slot, mode: picker.mode, person: picker.person } : null);
    setPicker(previous => ({ ...previous, open: false }));
    setEditor({ open: true, recipe: null, slot: nextContext?.slot || "lunch", context: nextContext });
  };

  const handlePick = async recipe => {
    const context = { day: picker.day, slot: picker.slot, mode: picker.mode, person: picker.person };
    setPicker(previous => ({ ...previous, open: false }));
    await applyRecipeTo(context, recipe);
  };

  const handleApplyMenu = async (menu, targetDay = picker.day) => {
    setPicker(previous => ({ ...previous, open: false }));
    try {
      await app.applyMenu(targetDay, menu);
      app.notify(interpolate(t.menuApplied, { day: t.dayNames[targetDay] }));
    } catch {
      // The hook already surfaced the error.
    }
  };

  const openMenuEditor = (menuOrOptions = null) => {
    const isContext = menuOrOptions && typeof menuOrOptions === "object" && "fromDay" in menuOrOptions;
    if (isContext) {
      const targetDay = menuOrOptions.fromDay ?? day;
      const items = menuItemsFromDay(app.plan[targetDay]);
      setMenuEditor({
        open: true,
        menu: {
          id: null,
          presetKey: null,
          name: { en: `${t.menuFromToday} · ${t.dayNames[targetDay]}`, lt: "" },
          emoji: "📅",
          items,
        },
      });
      return;
    }
    setMenuEditor({ open: true, menu: menuOrOptions || null });
  };

  const handleMenuSaved = async input => {
    const saved = await app.saveMenu(input);
    app.notify(t.menuSaved);
    return saved;
  };

  const handleEditorSaved = saved => {
    if (!saved) return;
    if (editor.context?.slot) applyRecipeTo(editor.context, saved);
    else setViewer(saved);
  };

  const handleDeleteRecipe = async id => {
    await app.deleteRecipe(id);
    if (viewer?.id === id) setViewer(null);
  };

  const demoEscape = app.isCloudConfigured && !app.isDemo
    ? () => { setOverrideDemo(true); window.location.reload(); }
    : undefined;

  // ── Gates ─────────────────────────────────────────────────────────────────
  // The update gate is rendered on every screen (including sign-in) so a new
  // build is offered before anything on screen can change.
  const updateGate = pwa.needRefresh
    ? <UpdateGate t={t} onUpdate={pwa.updateNow} onLater={pwa.dismiss} />
    : version.pending
      ? <VersionGate t={t} onAccept={version.accept} onLater={version.later} />
      : null;

  if (app.authLoading) return <>{<LoadingScreen t={t} onDemo={demoEscape} />}{updateGate}</>;
  if (!app.session) {
    return (
      <>
        <AuthScreen lang={lang} setLang={setLang} onSignIn={app.signIn} onSignUp={app.signUp} />
        {updateGate}
      </>
    );
  }
  // Keep the loading screen up until the profile lookup has actually resolved,
  // so "connect household" never flashes for an account that already has one.
  if (app.profileLoading || !app.profileChecked) return <>{<LoadingScreen t={t} onDemo={demoEscape} />}{updateGate}</>;
  if (app.profileError) {
    return (
      <>
        <ConnectionScreen
          t={t}
          error={app.profileError}
          host={app.backendHost}
          lang={lang}
          onRetry={app.retryConnection}
          onSignOut={app.signOut}
        />
        {updateGate}
      </>
    );
  }
  if (!app.profile) {
    return (
      <>
        <SetupScreen
          lang={lang}
          setLang={setLang}
          userEmail={app.session.user?.email}
          onCreate={app.createHousehold}
          onJoin={app.joinHousehold}
          onSignOut={app.signOut}
        />
        {updateGate}
      </>
    );
  }
  if (!app.dataReady) return <>{<LoadingScreen t={t} label={t.loadingKitchen} onDemo={demoEscape} />}{updateGate}</>;
  // A failed kitchen load must say *what* failed. The screen names the table,
  // the Supabase project host and the likely fix, and always offers a retry.
  if (app.loadError && !app.household) {
    return (
      <>
        <ConnectionScreen
          t={t}
          error={app.loadError}
          host={app.backendHost}
          lang={lang}
          onRetry={app.retryConnection}
          onSignOut={app.signOut}
        />
        {updateGate}
      </>
    );
  }

  const lowCount = app.lowPantry.length;

  return (
    <>
      <div className="app-shell">
        <header className="app-header">
          <div className="header-row">
            <div className="brand">
              <div className="brand-mark" aria-hidden="true">🌿</div>
              <div style={{ minWidth: 0 }}>
                <div className="brand-name">{t.appName}</div>
                <div className="brand-sub">{app.household?.name || t.tagline}</div>
              </div>
            </div>
            <div className="header-actions">
              <button type="button" className="icon-btn lang-btn" onClick={() => setLang(lang === "en" ? "lt" : "en")} title="Language" aria-label="Language">
                {lang === "en" ? "LT" : "EN"}
              </button>
              <button type="button" className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label={t.settingsTitle} title={t.settingsTitle}>
                ⚙️
              </button>
            </div>
          </div>
        </header>

        {(app.dataIssues || []).some(issue => issue.kind === "missing_schema") && (
          <SchemaNotice t={t} issues={app.dataIssues} />
        )}

        {app.isDemo && (
          <div className="demo-banner">
            <span aria-hidden="true">🧪</span>
            <span><b>{t.demoMode}.</b> {t.demoBody}</span>
          </div>
        )}

        <main className="app-main">
          {tab === "plan" && (
            <PlanTab
              app={app}
              lang={lang}
              t={t}
              day={day}
              setDay={setDay}
              todayIdx={todayIdx}
              onOpenRecipe={openViewer}
              onPick={openPicker}
              onOpenMenu={targetDay => openPicker({ day: targetDay, slot: null, mode: "menu", initialTab: "menus" })}
              onScan={targetDay => { setScanDay(targetDay ?? day); setScanOpen(true); }}
            />
          )}

          {tab === "suggest" && (
            <SuggestionsTab
              app={app}
              lang={lang}
              t={t}
              onOpenRecipe={recipe => openViewer(recipe)}
              onCreateRecipe={() => openNewRecipe(null)}
              onReviewIdea={draft => setEditor({ open: true, recipe: draft, slot: draft.slot, context: null })}
            />
          )}

          {tab === "shopping" && (
            <ShoppingTab app={app} lang={lang} t={t} onGoPantry={() => setTab("pantry")} />
          )}

          {tab === "pantry" && (
            <PantryTab app={app} lang={lang} t={t} onGoShopping={() => setTab("shopping")} />
          )}

          {tab === "tips" && <TipsTab lang={lang} t={t} />}
        </main>

        <nav className="bottom-nav" aria-label={t.appName}>
          <div className="bottom-nav-inner">
            {TABS.map(item => (
              <button
                key={item.id}
                type="button"
                className={`nav-item ${tab === item.id ? "active" : ""}`}
                onClick={() => setTab(item.id)}
                aria-current={tab === item.id ? "page" : undefined}
              >
                <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                <span>{tabLabels[item.id]}</span>
                {item.id === "pantry" && lowCount > 0 && (
                  <span className="nav-badge" aria-label={t.lowItems.replace("{n}", lowCount)}>{lowCount}</span>
                )}
              </button>
            ))}
          </div>
        </nav>
      </div>

      <RecipeModal
        recipe={viewer ? (app.recipesById.get(viewer.id) || viewer) : null}
        lang={lang}
        labels={app.labels}
        t={t}
        onClose={() => { setViewer(null); setViewerContext(null); }}
        onEdit={recipe => { setViewer(null); setEditor({ open: true, recipe, slot: recipe.slot, context: viewerContext }); }}
      />

      <RecipeEditor
        open={editor.open}
        recipe={editor.recipe}
        defaultSlot={editor.slot}
        lang={lang}
        t={t}
        onClose={() => setEditor(previous => ({ ...previous, open: false }))}
        onSave={app.saveRecipe}
        app={app}
        onDelete={handleDeleteRecipe}
        onSaved={handleEditorSaved}
      />

      <RecipePicker
        open={picker.open}
        onClose={() => setPicker(previous => ({ ...previous, open: false }))}
        day={picker.day}
        slot={picker.slot}
        mode={picker.mode}
        person={picker.person}
        currentRecipe={pickerCurrent}
        recipes={app.recipes}
        recipesById={app.recipesById}
        labels={app.labels}
        lang={lang}
        t={t}
        people={app.people}
        initialTab={picker.initialTab}
        onSelect={handlePick}
        onApplyMenu={handleApplyMenu}
        onCreateNew={() => openNewRecipe()}
        menus={app.menus}
        onCreateMenu={openMenuEditor}
        onEditMenu={menu => openMenuEditor(menu)}
        onResetMenu={key => app.resetMenu(key).catch(() => {})}
      />

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        app={app}
        lang={lang}
        setLang={setLang}
        t={t}
        pwa={pwa}
      />

      <MenuEditor
        open={menuEditor.open}
        menu={menuEditor.menu}
        recipes={app.recipes}
        lang={lang}
        t={t}
        onClose={() => setMenuEditor(previous => ({ ...previous, open: false }))}
        onSave={handleMenuSaved}
        onDelete={id => app.deleteMenu(id)}
        onReset={key => app.resetMenu(key).catch(() => {})}
      />

      <PhotoSheet
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        t={t}
        app={app}
        initialMode="meal"
        onApply={handleScanResult}
        dayLabel={t.dayNames[scanDay ?? day]}
      />

      {updateGate}

      <Toast toast={app.toast} />
    </>
  );
}
