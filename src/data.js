export const T = {
    en: {
        title: "Our Meal Plan", subtitle: "low-FODMAP · gluten-free",
        plan: "Plan", shopping: "Shopping", tips: "Tips",
        selectVariant: "Choose variant", changeVariant: "Change", removeVariant: "Remove variant",
        noVariant: "No variant chosen — tap Choose to start",
        previewTitle: "What's in this variant?", confirmSelect: "Select this variant",
        breakfast: "Breakfast", lunch: "Lunch", snack: "Snack", dinner: "Dinner",
        servingsFor: "Shopping for", person: "person", people: "people",
        selectDays: "Days to include", noMeals: "No meals planned for selected days",
        fodmap: "About FODMAP",
        kcal: "kcal", protein: "Protein", carbs: "Carbs", fat: "Fat",
        dailyTotal: "Day total", eaten: "eaten",
        viewRecipe: "View recipe",
        notePlaceholder: "Was it good? Any issues preparing it?",
        saveNote: "Save", cancelNote: "Cancel",
        ingredientsTitle: "Ingredients", methodTitle: "Method",
        days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        fullDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        diffNote: "Different portions",
        names: { R: "Regita", I: "Ieva" },
        addNote: "+ Add note…",
        markEaten: "Eat", // <--- SHORTENED HERE
        water: "Water today", waterGoal: "Goal: 1.7–2.2 L / day",
        swapMeal: "Swap", swapTitle: "Replace with another variant's meal",
        swapSame: "current", swapConfirm: "Use this meal",
        resetWeek: "New week", resetConfirm: "Clear all 7 days? (variants, eaten marks & swaps)", // <--- REMOVED NOTES WARNING
        resetYes: "Yes, clear all", resetNo: "Cancel",
        signIn: "Sign in", signUp: "Create account", email: "Email", password: "Password",
        signOut: "Sign out", signingIn: "Signing in…", signingUp: "Creating…",
        authError: "Login failed — check your email and password.",
        noAccount: "No account? Sign up", hasAccount: "Have an account? Sign in",
    },
    lt: {
        title: "Mūsų Mitybos Planas", subtitle: "mažai FODMAP · be glitimo",
        plan: "Planas", shopping: "Apsipirkimas", tips: "Patarimai",
        selectVariant: "Pasirinkti variantą", changeVariant: "Keisti", removeVariant: "Pašalinti variantą",
        noVariant: "Variantas nepasirinktas — spauskite Pasirinkti",
        previewTitle: "Kas yra šiame variante?", confirmSelect: "Pasirinkti šį variantą",
        breakfast: "Pusryčiai", lunch: "Pietūs", snack: "Užkandis", dinner: "Vakarienė",
        servingsFor: "Perkame", person: "asmeniui", people: "asmenims",
        selectDays: "Įtraukti dienas", noMeals: "Pasirinktoms dienoms nėra suplanuotų patiekalų",
        fodmap: "Apie FODMAP",
        kcal: "kcal", protein: "Baltymai", carbs: "Angliavandeniai", fat: "Riebalai",
        dailyTotal: "Dienos suma", eaten: "suvalgyta",
        viewRecipe: "Receptas",
        notePlaceholder: "Ar skanu? Ar buvo sunkumų gaminant?",
        saveNote: "Išsaugoti", cancelNote: "Atšaukti",
        ingredientsTitle: "Ingredientai", methodTitle: "Paruošimas",
        days: ["Pr", "An", "Tr", "Kt", "Pn", "Š", "S"],
        fullDays: ["Pirmadienis", "Antradienis", "Trečiadienis", "Ketvirtadienis", "Penktadienis", "Šeštadienis", "Sekmadienis"],
        diffNote: "Skirtingos porcijos",
        names: { R: "Regita", I: "Ieva" },
        addNote: "+ Pridėti pastabą…",
        markEaten: "Valgyti", // <--- SHORTENED HERE
        water: "Vanduo šiandien", waterGoal: "Tikslas: 1,7–2,2 L per dieną",
        swapMeal: "Keisti", swapTitle: "Pakeisti kito varianto patiekalu",
        swapSame: "dabartinis", swapConfirm: "Naudoti šį patiekalą",
        resetWeek: "Nauja savaitė", resetConfirm: "Ištrinti visas 7 dienas? (variantai, suvalgyta ir keitimai)", // <--- REMOVED NOTES WARNING
        resetYes: "Taip, ištrinti viską", resetNo: "Atšaukti",
        signIn: "Prisijungti", signUp: "Sukurti paskyrą", email: "El. paštas", password: "Slaptažodis",
        signOut: "Atsijungti", signingIn: "Jungiamasi…", signingUp: "Kuriama…",
        authError: "Prisijungti nepavyko — patikrinkite el. paštą ir slaptažodį.",
        noAccount: "Neturite paskyros? Sukurkite", hasAccount: "Turite paskyrą? Prisijunkite",
    }
};

export const mkI = (en, lt, amount, unit) => ({ en, lt, amount, unit });
export const SLOTS = ["breakfast", "lunch", "snack", "dinner"];

export const getMeal = (v, slot, person) => {
    if (!v) return null;
    const s = v.meals[slot];
    if (!s) return null;
    if (s.both) return s.both;
    return s[person] || null;
};

export const personKey = (v, slot) => {
    if (!v) return "both";
    const s = v.meals[slot];
    if (!s || s.both) return "both";
    return null;
};

export const fmtNum = n => { const r = Math.round(n * 10) / 10; return Number.isInteger(r) ? String(r) : r.toFixed(1); };

export const VARIANTS = [
    {
        id: 1, label: { en: "Variant I", lt: "I variantas" }, kcal: { R: 1488, I: 1503 }, diff: true, meals: {
            breakfast: {
                R: {
                    name: { en: "Avocado toast with boiled eggs", lt: "Avokado ant duonos su kiaušiniais" }, emoji: "🥑", kcal: 374, protein: 19, carbs: 19, fat: 25,
                    ing: [mkI("GF bread", "Duona be glitimo", 40, "g"), mkI("Avocado", "Avokadas", 40, "g"), mkI("Eggs", "Kiaušiniai", 2, "vnt"), mkI("Pumpkin seeds", "Moliūgų sėklos", 5, "g"), mkI("Chia seeds", "Chia sėklos", 5, "g"), mkI("Cucumber", "Agurkas", 50, "g"), mkI("Tomato", "Pomidoras", 50, "g")],
                    method: { en: "Mash avocado with lemon juice, salt & pepper. Spread on toasted bread, scatter seeds. Boil eggs. Serve with fresh cucumber and tomato.", lt: "Avokadą sutrinti su citrina, druska ir pipirais. Užtepti ant duonos, pabarstyti sėklų. Kiaušinius išvirti, valgyti su šviežia daržove." }
                },
                I: {
                    name: { en: "Buckwheat with boiled eggs & seeds", lt: "Grikiai su kiaušiniais ir sėklomis" }, emoji: "🥣", kcal: 388, protein: 20, carbs: 44, fat: 15,
                    ing: [mkI("Buckwheat", "Grikiai", 50, "g"), mkI("Eggs", "Kiaušiniai", 2, "vnt"), mkI("Pumpkin seeds", "Moliūgų sėklos", 5, "g"), mkI("Sesame seeds", "Sezamų sėklos", 5, "g"), mkI("Cucumber", "Agurkas", 70, "g"), mkI("Tomato", "Pomidoras", 30, "g"), mkI("Spinach", "Špinatai", 5, "g"), mkI("Parsley", "Petražolės", 5, "g"), mkI("Rocket", "Rukola", 5, "g")],
                    method: { en: "Cook buckwheat in salted water, top with seeds. Boil eggs to your liking. Serve with fresh cucumber, tomato and greens.", lt: "Grikius išvirti pasūdytame vandenyje, pagardinti sėklomis. Kiaušinius išvirti. Valgyti su šviežia daržove ir žalumynais." }
                }
            },
            lunch: {
                both: {
                    name: { en: "Roasted vegetables with tofu & Tahini", lt: "Orkaitėje keptos daržovės su tofu ir Tahini" }, emoji: "🥦", kcal: 504, protein: 29, carbs: 18, fat: 32,
                    ing: [mkI("Broccoli", "Brokolis", 62, "g"), mkI("Bell pepper", "Paprika", 63, "g"), mkI("Carrot", "Morka", 63, "g"), mkI("Courgette", "Cukinija", 62, "g"), mkI("Natural tofu", "Natūralus tofu", 150, "g"), mkI("Pumpkin seeds", "Moliūgų sėklos", 10, "g"), mkI("Tahini paste", "Sezamų pasta", 10, "g"), mkI("Olive oil", "Alyvuogių aliejus", 10, "g"), mkI("Lemon juice", "Citrinos sultys", 10, "ml")],
                    method: { en: "Place broccoli, pepper, carrot and courgette on baking paper. Season with salt, pepper & basil, drizzle with olive oil. Bake at 175°C for 20 min. Add sliced tofu near the end. Sprinkle with pumpkin seeds. Serve with Tahini thinned with lemon juice.", lt: "Brokolį, papriką, morką ir cukiniją sudėti ant kepimo popieriaus, apibarstyti prieskoniais, pašlakstyti aliejumi. Kepti 175°C 20 min. Baigiant kepti sudėti tofu. Pabarstyti sėklomis. Valgyti su Tahini + citrinos sulčių padažu." }
                }
            },
            snack: {
                both: {
                    name: { en: "Lactose-free yogurt with berries", lt: "Jogurtas be laktozės su uogomis" }, emoji: "🫐", kcal: 151, protein: 10, carbs: 15, fat: 6,
                    ing: [mkI("Lactose-free yogurt 2.5%", "Jogurtas be laktozės 2,5%", 200, "g"), mkI("Berries (fresh/frozen)", "Uogos (šviežios/šaldytos)", 100, "g")],
                    method: { en: "Mix yogurt with fresh or thawed berries.", lt: "Sumaišyti jogurtą su šviežiomis arba atšildytomis uogomis." }
                }
            },
            dinner: {
                both: {
                    name: { en: "Rice bowl with Edamame & Tahini", lt: "Ryžių dubenėlis su Edamame ir Tahini" }, emoji: "🍚", kcal: 460, protein: 12, carbs: 61, fat: 17,
                    ing: [mkI("Brown rice", "Rudieji ryžiai", 50, "g"), mkI("Tahini paste", "Sezamų pasta", 15, "g"), mkI("Edamame in brine", "Edamame pupelės sūryme", 50, "g"), mkI("Olive oil", "Alyvuogių aliejus", 5, "g"), mkI("Bell pepper", "Paprika", 100, "g"), mkI("Canned corn", "Kukurūzai (konservuoti)", 50, "g"), mkI("Cucumber", "Agurkas", 100, "g"), mkI("Lemon juice", "Citrinos sultys", 10, "ml")],
                    method: { en: "Cook rice in salted water. Slice vegetables into strips. Arrange rice in bowl, top with cucumber, pepper, corn and edamame. Dress with Tahini + olive oil + lemon juice.", lt: "Ryžius išvirti, pagardinti druska. Daržoves supjaustyti šiaudeliais. Į dubenėlį sudėti ryžius, ant jų daržoves ir pupeles. Pagardinti Tahini + aliejaus + citrinos sulčių padažu." }
                }
            }
        }
    },

    {
        id: 2, label: { en: "Variant II", lt: "II variantas" }, kcal: { R: 1591, I: 1591 }, diff: false, meals: {
            breakfast: {
                both: {
                    name: { en: "GF tortilla with egg omelette & avocado", lt: "GF tortilija su kiaušinių omletu ir avokadu" }, emoji: "🌯", kcal: 467, protein: 14, carbs: 40, fat: 28,
                    ing: [mkI("GF tortilla", "GF tortilija", 1, "vnt"), mkI("Eggs", "Kiaušiniai", 2, "vnt"), mkI("Olive oil", "Alyvuogių aliejus", 5, "g"), mkI("Avocado", "Avokadas", 40, "g"), mkI("Tomato", "Pomidoras", 100, "g"), mkI("Lemon juice", "Citrinos sultys", 5, "ml")],
                    method: { en: "Beat eggs with salt & pepper, fry as omelette. Mash avocado with lemon juice. Spread on tortilla, add tomato and omelette, roll up.", lt: "Kiaušinius išplakti su druska ir pipirais, iškepti kaip omletą. Avokadą sutrinti su citrina. Tortiliją patepti, dėti pomidorą ir omletą, susukti." }
                }
            },
            lunch: {
                both: {
                    name: { en: "Baked tofu with lentils & sun-dried tomatoes", lt: "Keptas tofu su lęšiais ir džiovintais pomidorais" }, emoji: "🫘", kcal: 480, protein: 30, carbs: 34, fat: 22,
                    ing: [mkI("Lentils", "Lęšiai", 50, "g"), mkI("Sun-dried tomatoes", "Džiovinti pomidorai", 20, "g"), mkI("Natural tofu", "Natūralus tofu", 100, "g"), mkI("Cucumber", "Agurkas", 34, "g"), mkI("Tomato", "Pomidoras", 33, "g"), mkI("Rocket", "Rukola", 33, "g"), mkI("Olive oil", "Alyvuogių aliejus", 5, "g"), mkI("Tahini paste", "Sezamų pasta", 10, "g"), mkI("Lemon juice", "Citrinos sultys", 5, "ml")],
                    method: { en: "Cook lentils in salted water. Season tofu with rosemary, cumin, salt & pepper. Bake at 180°C for 25–30 min. Mix lentils with sun-dried tomatoes and fresh vegetables. Top with sliced tofu, drizzle with olive oil and tahini.", lt: "Lęšius išvirti. Tofu įtrinti rozmarinu, kmynais, druska ir pipirais. Kepti 180°C 25–30 min. Sumaišyti lęšius su džiovintais pomidorais ir daržovėmis. Uždėti tofu, pašlakstyti aliejumi ir tahini." }
                }
            },
            snack: {
                both: {
                    name: { en: "Corn chips", lt: "Kukurūzų traškučiai" }, emoji: "🌽", kcal: 145, protein: 2, carbs: 19, fat: 6,
                    ing: [mkI("Corn chips (Santa Maria)", "Kukurūzų traškučiai (Santa Maria)", 30, "g")],
                    method: { en: "Ready to eat. Choose plain salted variety.", lt: "Vartoti kaip yra. Rinktis su druska." }
                }
            },
            dinner: {
                both: {
                    name: { en: "Soy steaks with braised vegetables & Kalamata olives", lt: "Sojos kepsneliai su troškintomis daržovėmis ir alyvuogėmis" }, emoji: "🫒", kcal: 498, protein: 29, carbs: 31, fat: 27,
                    ing: [mkI("Soy cubes", "Sojos kubeliai", 50, "g"), mkI("Olive oil", "Alyvuogių aliejus", 15, "g"), mkI("Kalamata olives", "Alyvuogės Kalamata", 50, "g"), mkI("Courgette", "Cukinija", 50, "g"), mkI("Carrot", "Morka", 50, "g"), mkI("Bell pepper", "Paprika", 50, "g"), mkI("Spinach", "Špinatai", 50, "g"), mkI("Tomato sauce", "Pomidorų padažas", 40, "g"), mkI("Dill", "Krapai", 5, "g"), mkI("Parsley", "Petražolės", 5, "g")],
                    method: { en: "Prepare soy cubes per instructions, fry with oil until golden. Chop vegetables, sauté with remaining oil, add tomato sauce, braise 10 min. Serve soy on top of vegetables with olives on the side.", lt: "Sojos kubelius paruošti pagal instrukciją, apkepti su aliejumi. Daržoves pakepinti, sudėti pomidorų padažą, patroškinti 10 min. Alyvuoges valgyti kaip priedą." }
                }
            }
        }
    },

    {
        id: 3, label: { en: "Variant III", lt: "III variantas" }, kcal: { R: 1596, I: 1596 }, diff: false, meals: {
            breakfast: {
                both: {
                    name: { en: "Shakshuka eggs with GF bread", lt: "Kepti kiaušiniai su pomidoru ir GF duona" }, emoji: "🍳", kcal: 423, protein: 22, carbs: 23, fat: 28,
                    ing: [mkI("Eggs", "Kiaušiniai", 3, "vnt"), mkI("Tomato", "Pomidoras", 100, "g"), mkI("Olive oil", "Alyvuogių aliejus", 10, "g"), mkI("Oregano", "Raudonėlis", 3, "g"), mkI("Parsley", "Petražolės", 6, "g"), mkI("Rocket", "Rukola", 6, "g"), mkI("GF bread", "Duona be glitimo", 40, "g")],
                    method: { en: "Dice tomato and fry in pan with oil 2 min. Make 3 wells, crack in eggs. Season with salt & oregano. Cover and cook on low heat. Garnish with fresh herbs. Serve with GF bread.", lt: "Pomidorą supjaustyti, kepti su aliejumi 2 min. Padaryti 3 griovelius, įmušti kiaušinius. Pagardinti druska ir raudonėliais. Kepti po dangčiu. Valgyti su GF duona." }
                }
            },
            lunch: {
                both: {
                    name: { en: "Grilled Halloumi with quinoa & roasted vegetables", lt: "Keptas Halloumi su bolivine balanda ir daržovėmis" }, emoji: "🧀", kcal: 564, protein: 23, carbs: 35, fat: 38,
                    ing: [mkI("Quinoa", "Bolivinė balanda", 30, "g"), mkI("Sun-dried tomatoes", "Džiovinti pomidorai", 30, "g"), mkI("Halloumi cheese", "Halloumi sūris", 80, "g"), mkI("Carrot", "Morka", 38, "g"), mkI("Courgette", "Cukinija", 37, "g"), mkI("Broccoli", "Brokolis", 37, "g"), mkI("Bell pepper", "Paprika", 38, "g"), mkI("Olive oil", "Alyvuogių aliejus", 10, "g")],
                    method: { en: "Grill or bake Halloumi until golden. Cook quinoa in salted water, mix with sun-dried tomatoes. Roast carrot, courgette, broccoli and bell pepper with oil alongside cheese at 180°C for 20 min.", lt: "Sūrį pakepti ant grilio ar orkaitėje. Kruopas išvirti, sumaišyti su džiovintais pomidorais. Morką, cukiniją, brokolį ir papriką kepti su aliejumi kartu su sūriu 180°C 20 min." }
                }
            },
            snack: {
                both: {
                    name: { en: "Baked pear", lt: "Kepta kriaušė" }, emoji: "🍐", kcal: 90, protein: 1, carbs: 20, fat: 0,
                    ing: [mkI("Pear", "Kriaušė", 200, "g")],
                    method: { en: "Bake whole or halved pear at 180°C until soft (~20 min). Optionally add cinnamon.", lt: "Kriaušę kepti 180°C kol suminkštės (~20 min). Galima pabarstyti cinamonu." }
                }
            },
            dinner: {
                both: {
                    name: { en: "Chickpea & beetroot salad with orange mustard dressing", lt: "Avinžirnių ir burokėlių salotos su apelsinų garstyčių padažu" }, emoji: "🥗", kcal: 519, protein: 18, carbs: 60, fat: 23,
                    ing: [mkI("Canned chickpeas", "Avinžirniai (konservuoti)", 150, "g"), mkI("Iceberg lettuce", "Aisbergo salotos", 25, "g"), mkI("Spinach", "Špinatai", 25, "g"), mkI("Cooked beetroot", "Virti burokėliai", 150, "g"), mkI("Wholegrain mustard", "Grūdėtos garstyčios", 10, "g"), mkI("Olive oil", "Alyvuogių aliejus", 10, "g"), mkI("Honey", "Medus", 10, "g"), mkI("Walnuts", "Graikiniai riešutai", 15, "g"), mkI("Orange", "Apelsinas", 150, "g")],
                    method: { en: "Chop salad leaves, slice beetroot. Drain chickpeas, season, fry briefly in oil. Layer leaves and beetroot, top with chickpeas. Dressing: olive oil + mustard + honey + juice of ½ orange. Drizzle over, top with crushed walnuts and orange segments.", lt: "Salotos lapus susmulkinti, burokėlius supjaustyti. Avinžirnius nukošti, pakepti. Ant lėkštės dėti salotas ir burokėlius, ant viršaus avinžirnius. Padažu apšlakstyti, pabarstyti riešutais." }
                }
            }
        }
    },

    {
        id: 4, label: { en: "Variant IV", lt: "IV variantas" }, kcal: { R: 1596, I: 1596 }, diff: false, meals: {
            breakfast: {
                both: {
                    name: { en: "Chia pudding with plant protein, berries & coconut", lt: "Chia pudingas su augaliniu proteinu, uogomis ir kokosais" }, emoji: "🫙", kcal: 423, protein: 25, carbs: 23, fat: 23,
                    ing: [mkI("Chia seeds", "Chia sėklos", 40, "g"), mkI("Plant protein powder", "Augalinis proteinas", 20, "g"), mkI("Plant milk", "Augalinis pienas", 200, "ml"), mkI("Berries (fresh/frozen)", "Uogos (šviežios/šaldytos)", 100, "g"), mkI("Coconut flakes", "Kokosų drožlės", 10, "g")],
                    method: { en: "Mix chia seeds and protein powder with plant milk. Refrigerate overnight or at least 30 min. Top with berries and coconut flakes.", lt: "Chia sėklas ir baltymų miltelius sumaišyti su augaliniu pienu. Dėti nakčiai arba bent 30 min į šaldytuvą. Ryte įdėti uogų, pabarstyti kokosų drožlėmis." }
                }
            },
            lunch: {
                both: {
                    name: { en: "GF toast with tofu & sun-dried tomato spread", lt: "GF tostai su tofu ir džiovintų pomidorų užtepėle" }, emoji: "🍞", kcal: 518, protein: 26, carbs: 46, fat: 24,
                    ing: [mkI("GF bread", "Duona be glitimo", 80, "g"), mkI("Sun-dried tomatoes", "Džiovinti pomidorai", 50, "g"), mkI("Natural tofu", "Natūralus tofu", 100, "g"), mkI("Pumpkin seeds", "Moliūgų sėklos", 5, "g"), mkI("Sesame seeds", "Sezamų sėklos", 5, "g"), mkI("Tomato", "Pomidoras", 150, "g")],
                    method: { en: "Mash tofu with finely chopped sun-dried tomatoes. Spread on toasted bread, top with fresh tomato slices and seeds.", lt: "Tofu sutrinti su smulkiai pjaustytais džiovintais pomidorais. Tepti ant paskrudintos duonos, ant viršaus uždėti pomidoro griežinėlį ir pabarstyti sėklų." }
                }
            },
            snack: {
                both: {
                    name: { en: "Kiwi", lt: "Kivis" }, emoji: "🥝", kcal: 92, protein: 2, carbs: 22, fat: 1,
                    ing: [mkI("Kiwi", "Kivis", 2, "vnt")],
                    method: { en: "Peel and eat.", lt: "Nulupti ir valgyti." }
                }
            },
            dinner: {
                both: {
                    name: { en: "Quinoa salad with spinach, soft-boiled eggs & walnuts", lt: "Bolivinių balandų salotos su špinatais, kiaušiniais ir riešutais" }, emoji: "🥬", kcal: 514, protein: 21, carbs: 37, fat: 33,
                    ing: [mkI("Quinoa", "Bolivinė balanda", 50, "g"), mkI("Sun-dried tomatoes", "Džiovinti pomidorai", 20, "g"), mkI("Spinach", "Špinatai", 50, "g"), mkI("Eggs", "Kiaušiniai", 2, "vnt"), mkI("Walnuts", "Graikiniai riešutai", 10, "g"), mkI("Olive oil", "Alyvuogių aliejus", 10, "g"), mkI("Lemon juice", "Citrinos sultys", 10, "ml")],
                    method: { en: "Soft-boil eggs (6 min). Cook quinoa in salted water, let cool. Mix with chopped spinach, diced sun-dried tomatoes and crushed walnuts. Place halved eggs on top. Dress with olive oil + lemon juice + salt & pepper.", lt: "Kiaušinius išvirti 6 min (minkšti). Bolivines balandas išvirti, atvėsinti. Sumaišyti su špinatais, džiovintais pomidorais ir riešutais. Uždėti kiaušinius. Aplieti aliejaus + citrinos sulčių padažu." }
                }
            }
        }
    },

    {
        id: 5, label: { en: "Variant V", lt: "V variantas" }, kcal: { R: 1589, I: 1604 }, diff: true, meals: {
            breakfast: {
                R: {
                    name: { en: "Protein smoothie with banana & berries", lt: "Baltyminis smoothie su bananu ir uogomis" }, emoji: "🥤", kcal: 436, protein: 26, carbs: 45, fat: 17,
                    ing: [mkI("Peanut butter", "Žemės riešutų sviestas", 15, "g"), mkI("Plant protein powder", "Augalinis proteinas", 20, "g"), mkI("Cashews", "Anakardžiai", 20, "g"), mkI("Berries (fresh/frozen)", "Uogos (šviežios/šaldytos)", 150, "g"), mkI("Banana", "Bananas", 120, "g")],
                    method: { en: "Blend all ingredients together. Add water to desired consistency.", lt: "Suplakti visus ingredientus. Pagal norą įpilti vandens." }

                },
                I: {
                    name: { en: "Overnight oats with berries & nut butter", lt: "Per naktį brinkintos avižos su uogomis ir riešutų sviestu" }, emoji: "🌙", kcal: 421, protein: 14, carbs: 51, fat: 16,
                    ing: [mkI("GF rolled oats", "Avižiniai dribsniai (be glitimo)", 50, "g"), mkI("Plant milk", "Augalinis pienas", 100, "ml"), mkI("Lactose-free yogurt 2.5%", "Jogurtas be laktozės 2,5%", 100, "g"), mkI("Berries (fresh/frozen)", "Uogos (šviežios/šaldytos)", 150, "g"), mkI("Dark chocolate", "Juodasis šokoladas", 5, "g"), mkI("Nut butter", "Riešutų sviestas", 10, "g")],
                    method: { en: "Evening: mix oats with yogurt and milk. Refrigerate overnight. Morning: top with berries, nut butter and crushed dark chocolate.", lt: "Vakare sumaišyti dribsnius su jogurtu ir pienu. Laikyti šaldytuve. Ryte pagardinti uogomis, riešutų sviestu ir susmulkintu šokoladu." }
                }
            },
            lunch: {
                both: {
                    name: { en: "Buckwheat pasta with smoked tofu & cherry tomatoes", lt: "Grikių makaronai su rūkytu tofu ir vyšniniais pomidorais" }, emoji: "🍝", kcal: 504, protein: 26, carbs: 41, fat: 26,
                    ing: [mkI("Buckwheat pasta", "Grikių makaronai", 50, "g"), mkI("Smoked tofu", "Rūkytas tofu", 100, "g"), mkI("Cherry tomatoes", "Vyšniniai pomidorai", 150, "g"), mkI("Spinach", "Špinatai", 50, "g"), mkI("Olive oil", "Alyvuogių aliejus", 15, "g")],
                    method: { en: "Cook pasta. Place spinach, cherry tomatoes and diced smoked tofu in baking dish, drizzle with oil, bake ~20 min at 180°C. Mash with a fork, add pasta and mix well. Season with herbs, salt & pepper.", lt: "Makaronus išvirti. Į kepimo indą sudėti špinatus, pomidoriukus ir tofu, apšlakstyti aliejumi, kepti ~20 min. Sutrinti šakute, sudėti makaronus, gerai išmaišyti." }
                }
            },
            snack: {
                R: {
                    name: { en: "Corn chips", lt: "Kukurūzų traškučiai" }, emoji: "🌽", kcal: 145.2, protein: 1.89, carbs: 19.2, fat: 6,
                    ing: [mkI("Corn chips (Santa Maria)", "Kukurūzų traškučiai (Santa Maria)", 30, "g")],
                    method: { en: "Ready to eat.", lt: "Vartoti kaip yra." }
                },
                I: {
                    name: { en: "Banana with peanut butter", lt: "Bananas su riešutų sviestu" }, emoji: "🍌", kcal: 160.8, protein: 4.24, carbs: 26.6, fat: 4.22,
                    ing: [mkI("Banana", "Bananas", 120, "g"), mkI("Peanut butter", "Riešutų sviestas", 10, "g")],
                    method: { en: "Eat banana with peanut butter.", lt: "Bananą valgyti su riešutų sviestu." }
                }
            },
            dinner: {
                both: {
                    name: { en: "Chickpea & beetroot salad with orange mustard dressing", lt: "Avinžirnių ir burokėlių salotos su apelsinų garstyčių padažu" }, emoji: "🥗", kcal: 519, protein: 18, carbs: 60, fat: 23,
                    ing: [mkI("Canned chickpeas", "Avinžirniai (konservuoti)", 150, "g"), mkI("Iceberg lettuce", "Aisbergo salotos", 25, "g"), mkI("Spinach", "Špinatai", 25, "g"), mkI("Cooked beetroot", "Virti burokėliai", 150, "g"), mkI("Wholegrain mustard", "Grūdėtos garstyčios", 10, "g"), mkI("Olive oil", "Alyvuogių aliejus", 10, "g"), mkI("Honey", "Medus", 10, "g"), mkI("Walnuts", "Graikiniai riešutai", 15, "g"), mkI("Orange", "Apelsinas", 150, "g")],
                    method: { en: "Chop salad leaves, slice beetroot. Drain chickpeas, season, fry briefly in oil. Layer leaves and beetroot, top with chickpeas. Dressing: olive oil + mustard + honey + juice of ½ orange. Drizzle over, top with crushed walnuts and orange segments.", lt: "Salotos lapus susmulkinti, burokėlius supjaustyti. Avinžirnius nukošti, pakepti. Ant lėkštės dėti salotas ir burokėlius, ant viršaus avinžirnius. Padažu apšlakstyti, pabarstyti riešutais." }
                }
            }
        }
    },

    {
        id: 6, label: { en: "Variant VI", lt: "VI variantas" }, kcal: { R: 1618, I: 1618 }, diff: false, meals: {
            breakfast: {
                both: {
                    name: { en: "Baked oatmeal with banana & hemp seeds", lt: "Kepta avižinė košė su bananu ir kanapių sėklomis" }, emoji: "🍌", kcal: 527, protein: 26, carbs: 65, fat: 17,
                    ing: [mkI("GF rolled oats", "Avižiniai dribsniai (be glitimo)", 70, "g"), mkI("Egg", "Kiaušinis", 1, "vnt"), mkI("Plant milk", "Augalinis pienas", 50, "ml"), mkI("Banana", "Bananas", 120, "g"), mkI("Hemp seeds (shelled)", "Kanapių sėklos (lukštentos)", 15, "g")],
                    method: { en: "Blend oats, banana, egg and milk until smooth. Add a pinch of baking powder and optional sweetener. Mix in hemp seeds. Pour into baking dish and bake at 180°C for 20–25 min.", lt: "Trintuvu sutrinti avižinius dribsnius, bananą, kiaušinį ir pieną. Įberti kepimo miltelius ir kanapių sėklas. Supilti į formelę, kepti 180°C 20–25 min." }
                }
            },
            lunch: {
                both: {
                    name: { en: "Soy Teriyaki with GF pasta", lt: "Sojos Teriyaki su makaronais" }, emoji: "🥢", kcal: 525, protein: 32, carbs: 66, fat: 15,
                    ing: [mkI("Soy cubes", "Sojos kubeliai", 50, "g"), mkI("Carrot", "Morka", 50, "g"), mkI("Maple syrup", "Klevų sirupas", 10, "g"), mkI("GF soy sauce", "Sojos padažas (be glitimo)", 20, "g"), mkI("Tomato paste", "Pomidorų pasta", 20, "g"), mkI("Olive oil", "Alyvuogių aliejus", 10, "g"), mkI("GF pasta", "Makaronai (be glitimo)", 50, "g")],
                    method: { en: "Prepare soy cubes per package instructions. Fry in oil, add sliced carrot. Mix tomato paste with maple syrup and soy sauce, pour over. Braise covered for 10 min. Cook pasta separately. Mix everything together.", lt: "Sojos kubelius paruošti pagal instrukciją. Kepti su aliejumi, įdėti morką. Pomidorų pastą sumaišyti su klevų sirupu ir sojos padažu, supilti. Troškinti po dangčiu 10 min. Makaronus išvirti. Sumaišyti." }
                }
            },
            snack: {
                both: {
                    name: { en: "Kiwi", lt: "Kivis" }, emoji: "🥝", kcal: 92, protein: 2, carbs: 22, fat: 1,
                    ing: [mkI("Kiwi", "Kivis", 2, "vnt")],
                    method: { en: "Peel and eat.", lt: "Nulupti ir valgyti." }
                }
            },
            dinner: {
                both: {
                    name: { en: "Rice with smoked tofu, olives & coconut cream", lt: "Ryžiai su rūkytu tofu, alyvuogėmis ir kokosų grietinėle" }, emoji: "🍚", kcal: 474, protein: 15, carbs: 37, fat: 29,
                    ing: [mkI("Smoked tofu", "Rūkytas tofu", 50, "g"), mkI("Brown or black rice", "Rudieji arba juodieji ryžiai", 40, "g"), mkI("Olives", "Alyvuogės", 50, "g"), mkI("Sun-dried tomatoes", "Džiovinti pomidorai", 20, "g"), mkI("Coconut cream", "Kokosų grietinėlė", 50, "g"), mkI("Pumpkin seeds", "Moliūgų sėklos", 5, "g"), mkI("Sesame seeds", "Sezamų sėklos", 5, "g")],
                    method: { en: "Cook rice until soft. Fry diced sun-dried tomatoes in pan. Add halved olives and cubed tofu, pour in coconut cream. Add rice, mix well, season and braise briefly. Sprinkle with seeds.", lt: "Ryžius išvirti. Pakepti pomidorus, pridėti alyvuoges ir tofu, supilti grietinėlę. Sudėti ryžius, gerai išmaišyti, pagardinti, patroškinti. Pabarstyti sėklomis." }
                }
            }
        }
    },

    {
        id: 7, label: { en: "Variant VII", lt: "VII variantas" }, kcal: { R: 1578, I: 1578 }, diff: false, meals: {
            breakfast: {
                both: {
                    name: { en: "Yogurt with chia seeds, berries & nut butter", lt: "Jogurtas su chia sėklomis, uogomis ir riešutų kremu" }, emoji: "🫐", kcal: 437, protein: 21, carbs: 23, fat: 27,
                    ing: [mkI("Lactose-free yogurt 2.5%", "Jogurtas be laktozės 2,5%", 250, "g"), mkI("Chia seeds", "Chia sėklos", 40, "g"), mkI("Berries (fresh/frozen)", "Uogos (šviežios/šaldytos)", 100, "g"), mkI("Nut butter", "Riešutų sviestas", 15, "g")],
                    method: { en: "Prepare evening before: layer yogurt, chia seeds and berries in a jar. Allow chia to swell at least 20 min. Top with nut butter just before eating.", lt: "Ruošti iš vakaro: į indelį sudėti jogurtą, chia sėklas, uogas. Leisti sėkloms išbrinkti bent 20 min. Prieš valgant ant viršaus uždėti riešutų kremą." }
                }
            },
            lunch: {
                both: {
                    name: { en: "GF toast with tofu & sun-dried tomato spread", lt: "GF tostai su tofu ir džiovintų pomidorų užtepėle" }, emoji: "🍞", kcal: 518, protein: 26, carbs: 46, fat: 24,
                    ing: [mkI("GF bread", "Duona be glitimo", 80, "g"), mkI("Sun-dried tomatoes", "Džiovinti pomidorai", 50, "g"), mkI("Natural tofu", "Natūralus tofu", 100, "g"), mkI("Pumpkin seeds", "Moliūgų sėklos", 5, "g"), mkI("Sesame seeds", "Sezamų sėklos", 5, "g"), mkI("Tomato", "Pomidoras", 150, "g")],
                    method: { en: "Mash tofu with finely chopped sun-dried tomatoes. Toast bread, spread with tofu mixture, top with fresh tomato slices and scatter pumpkin and sesame seeds.", lt: "Tofu sutrinti su smulkiai pjaustytais džiovintais pomidorais. Paskrudinti duoną, patepti tofu mase, ant viršaus uždėti pomidoro griežinėlį ir pabarstyti sėklų." }
                }
            },
            snack: {
                both: {
                    name: { en: "Fresh pineapple", lt: "Šviežias ananasas" }, emoji: "🍍", kcal: 130, protein: 1, carbs: 32, fat: 1,
                    ing: [mkI("Pineapple", "Ananasas", 250, "g")],
                    method: { en: "Peel and slice.", lt: "Nulupti ir supjaustyti." }
                }
            },
            dinner: {
                both: {
                    name: { en: "Lentil & chickpea bowl with beetroot", lt: "Lęšiai su avinžirniais ir burokėlių salotomis" }, emoji: "🥣", kcal: 493, protein: 26, carbs: 56, fat: 18,
                    ing: [mkI("Lentils", "Lęšiai", 50, "g"), mkI("Canned chickpeas", "Avinžirniai (konservuoti)", 100, "g"), mkI("Pumpkin seeds", "Moliūgų sėklos", 10, "g"), mkI("Sun-dried tomatoes", "Džiovinti pomidorai", 30, "g"), mkI("Cooked beetroot", "Virti burokėliai", 150, "g"), mkI("Olive oil", "Alyvuogių aliejus", 5, "g")],
                    method: { en: "Cook lentils in salted water. Mix with drained chickpeas, pumpkin seeds and diced sun-dried tomatoes. Dice cooked beetroot, season with salt and a little oil. Serve alongside. Garnish with fresh herbs.", lt: "Lęšius išvirti, sumaišyti su avinžirniais, sėklomis ir pjaustytais džiovintais pomidorais. Burokėlius supjaustyti kubeliais, pagardinti druska ir aliejumi." }
                }
            }
        }
    },

    {
        id: 8, label: { en: "Variant VIII", lt: "VIII variantas" }, kcal: { R: 1559, I: 1457 }, diff: true, meals: {
            breakfast: {
                R: {
                    name: { en: "Yogurt with banana", lt: "Jogurtas su bananu ir proteinu" }, emoji: "🍌", kcal: 392, protein: 28, carbs: 35, fat: 15,
                    ing: [mkI("Lactose-free yogurt 2.5%", "Jogurtas", 200, "g"), mkI("Plant protein powder", "Augalinis proteinas", 20, "g"), mkI("Walnuts", "Graikiniai riešutai", 15, "g"), mkI("Banana", "Bananas", 120, "g")],
                    method: { en: "Mix yogurt with protein. Add banana.", lt: "Jogurtą sumaišyti su proteinu. Įdėti bananą." }
                },
                I: {
                    name: { en: "Quinoa porridge with protein", lt: "Bolivinių balandų košė su proteinu" }, emoji: "🥣", kcal: 441, protein: 29, carbs: 59, fat: 11,
                    ing: [mkI("Quinoa", "Bolivinė balanda", 50, "g"), mkI("Plant protein powder", "Augalinis proteinas", 20, "g"), mkI("Banana", "Bananas", 120, "g"), mkI("Hemp seeds", "Kanapių sėklos", 15, "g")],
                    method: { en: "Cook quinoa, stir in protein and banana.", lt: "Kruopas išvirti, įmaišyti proteiną ir bananą." }
                }
            },
            lunch: {
                both: {
                    name: { en: "GF pasta with tofu, broccoli, spinach & Tahini", lt: "GF makaronai su tofu, brokoliu, špinatais ir Tahini" }, emoji: "🍝", kcal: 488, protein: 30, carbs: 37, fat: 25,
                    ing: [mkI("GF pasta", "Makaronai (be glitimo)", 50, "g"), mkI("Tofu", "Tofu", 50, "g"), mkI("Broccoli", "Brokolis", 150, "g"), mkI("Spinach", "Špinatai", 50, "g"), mkI("Tahini paste", "Sezamų pasta", 10, "g"), mkI("Olive oil", "Alyvuogių aliejus", 10, "g")],
                    method: { en: "Cook pasta. Lightly sauté broccoli and tofu in olive oil. Return pasta to pan, add tahini, season with salt, pepper and fresh herbs. Mix well.", lt: "Makaronus išvirti. Brokolį su tofu truputį pakepti alyvuogių aliejuje. Grąžinti makaronus, sudėti tahini, pagardinti druska, pipirais, žolelėmis ir išmaišyti." }
                }
            },
            snack: {
                R: {
                    name: { en: "Dried apricots (50g)", lt: "Džiovinti abrikosai (50g)" }, emoji: "🍑", kcal: 132, protein: 2, carbs: 31, fat: 0,
                    ing: [mkI("Dried apricots", "Džiovinti abrikosai", 50, "g")],
                    method: { en: "Ready to eat.", lt: "Vartoti kaip yra." }
                },
                I: {
                    name: { en: "Dried apricots (30g)", lt: "Džiovinti abrikosai (30g)" }, emoji: "🍑", kcal: 79, protein: 1, carbs: 19, fat: 0,
                    ing: [mkI("Dried apricots", "Džiovinti abrikosai", 30, "g")],
                    method: { en: "Ready to eat.", lt: "Vartoti kaip yra." }
                }
            },
            dinner: {
                both: {
                    name: { en: "Soy steaks with braised vegetables & Kalamata olives", lt: "Sojos kepsneliai su troškintomis daržovėmis ir alyvuogėmis" }, emoji: "🫒", kcal: 498, protein: 29, carbs: 31, fat: 27,
                    ing: [mkI("Soy cubes", "Sojos kubeliai", 50, "g"), mkI("Olive oil", "Alyvuogių aliejus", 15, "g"), mkI("Kalamata olives", "Alyvuogės Kalamata", 50, "g"), mkI("Courgette", "Cukinija", 50, "g"), mkI("Carrot", "Morka", 50, "g"), mkI("Bell pepper", "Paprika", 50, "g"), mkI("Spinach", "Špinatai", 50, "g"), mkI("Tomato sauce", "Pomidorų padažas", 40, "g"), mkI("Dill", "Krapai", 5, "g"), mkI("Parsley", "Petražolės", 5, "g")],
                    method: { en: "Prepare soy cubes per instructions, fry with oil until golden. Chop vegetables, sauté with remaining oil, add tomato sauce, braise 10 min. Serve soy on top of vegetables with olives on the side.", lt: "Sojos kubelius paruošti pagal instrukciją, apkepti su aliejumi. Daržoves pakepinti, sudėti pomidorų padažą, patroškinti 10 min. Alyvuoges valgyti kaip priedą." }
                }
            }
        }
    },

    {
        id: 9, label: { en: "Variant IX", lt: "IX variantas" }, kcal: { R: 1604, I: 1604 }, diff: false, meals: {
            breakfast: {
                both: {
                    name: { en: "Tofu cottage-cheese balls with yogurt & berries", lt: "Tofu varškėtukai su jogurtu ir uogomis" }, emoji: "🧁", kcal: 493, protein: 31, carbs: 47, fat: 19,
                    ing: [mkI("Natural tofu", "Natūralus tofu", 200, "g"), mkI("Oat flour", "Avižų miltai", 80, "g"), mkI("Eggs", "Kiaušiniai", 2, "vnt"), mkI("Honey or maple syrup", "Medus arba klevų sirupas", 20, "g"), mkI("Lactose-free yogurt 2.5%", "Jogurtas be laktozės 2,5%", 200, "g"), mkI("Berries (fresh/frozen)", "Uogos (šviežios/šaldytos)", 200, "g")],
                    method: { en: "Combine tofu, eggs, oat flour, a pinch of baking powder and honey; mix until smooth. Shape into balls. Air-fry at 180°C for 10 min, flip and cook 5 more min (or bake in oven). Serve with yogurt and lightly mashed berries.", lt: "Į dubenį su tofu įmušti kiaušinius, suberti miltus, kepimo miltelius ir medų. Išmaišyti. Suformuoti varškėtukus. Kepti gruzdintuvėje 180°C 10 min, apversti ir kepti dar 5 min. Valgyti su jogurtu ir trintomis uogomis." }
                }
            },
            lunch: {
                both: {
                    name: { en: "GF tortilla wrap with hummus, eggs & roasted vegetables", lt: "GF tortilija su humusu, kiaušiniais ir keptomis daržovėmis" }, emoji: "🌯", kcal: 539, protein: 20, carbs: 40, fat: 31,
                    ing: [mkI("GF tortilla", "GF tortilija", 1, "vnt"), mkI("Eggs", "Kiaušiniai", 2, "vnt"), mkI("Olive oil", "Alyvuogių aliejus", 10, "g"), mkI("Hummus", "Humusas", 30, "g"), mkI("Courgette", "Cukinija", 50, "g"), mkI("Bell pepper", "Paprika", 50, "g"), mkI("Broccoli", "Brokolis", 50, "g")],
                    method: { en: "Chop courgette, pepper and broccoli and fry with olive oil until just tender. Add beaten eggs and scramble together with vegetables, season. Spread hummus on tortilla, fill with vegetable-egg mixture, roll up.", lt: "Cukiniją, papriką ir brokolį supjaustyti ir pakepti su alyvuogių aliejumi. Įmušti kiaušinius ir iškepti maišant, pagardinti. Tortiliją patepti humusu, susukti." }
                }
            },
            snack: {
                both: {
                    name: { en: "Nuts", lt: "Riešutai" }, emoji: "🥜", kcal: 125, protein: 4, carbs: 2, fat: 11,
                    ing: [mkI("Nuts", "Riešutai", 20, "g")],
                    method: { en: "Eat nuts.", lt: "Suvalgyti riešutus." }
                }
            },
            dinner: {
                both: {
                    name: { en: "Vegetarian bowl with smoked tofu & Tahini-yogurt dressing", lt: "Vegetariškas Bowl su rūkytu tofu ir Tahini-jogurto padažu" }, emoji: "🥣", kcal: 446, protein: 21, carbs: 58, fat: 14,
                    ing: [mkI("Brown or wild rice", "Rudieji arba laukiniai ryžiai", 50, "g"), mkI("Smoked tofu", "Rūkytas tofu", 50, "g"), mkI("Lactose-free yogurt 2.5%", "Jogurtas be laktozės 2,5%", 100, "g"), mkI("Tahini paste", "Sezamų pasta", 10, "g"), mkI("Bell pepper", "Paprika", 150, "g"), mkI("Cucumber", "Agurkas", 150, "g")],
                    method: { en: "Cook rice in salted water. Slice cucumber and pepper into strips, dice smoked tofu. Layer rice in bowl, top with vegetables and tofu. Sauce: yogurt + tahini + a pinch of salt.", lt: "Ryžius išvirti. Agurką ir papriką supjaustyti šiaudeliais. Sūrį supjaustyti. Į dubenėlį sudėti ryžius, ant jų daržoves ir sūrį. Padažui jogurtą sumaišyti su tahini, pagardinti druska." }
                }
            }
        }
    },

    {
        id: 10, label: { en: "Variant X", lt: "X variantas" }, kcal: { R: 1515, I: 1515 }, diff: false, meals: {
            breakfast: {
                both: {
                    name: { en: "Flaxseed cracker with avocado & eggs", lt: "Linų sėmenų sausuolis su avokadu ir kiaušiniais" }, emoji: "🥚", kcal: 463, protein: 24, carbs: 17, fat: 39,
                    ing: [mkI("Flaxseed cracker", "Linų sėmenų sausuolis", 1, "vnt"), mkI("Avocado (¼)", "Avokadas (¼)", 25, "g"), mkI("Eggs", "Kiaušiniai", 2, "vnt"), mkI("Tomato", "Pomidoras", 75, "g"), mkI("Cucumber", "Agurkas", 75, "g"), mkI("Olive oil", "Alyvuogių aliejus", 10, "g"), mkI("Lemon juice", "Citrinos sultys", 5, "ml")],
                    method: { en: "Mash avocado with lemon juice, salt & pepper, spread on cracker. Prepare tomato & cucumber salad with salt, pepper and olive oil. Soft-boil or fry 2 eggs without oil.", lt: "Ant sausuolio užtepti sutrinto avokado. Pagaminti pomidorų ir agurkų salotų su druska, pipirais ir alyvuogių aliejumi. Išvirti arba iškepti be aliejaus porą kiaušinių." }
                }
            },
            lunch: {
                both: {
                    name: { en: "Millet bowl with Edamame, vegetables & Tahini", lt: "Sorų dubenėlis su Edamame, daržovėmis ir Tahini" }, emoji: "🫛", kcal: 466, protein: 13, carbs: 34, fat: 28,
                    ing: [mkI("Millet", "Sorų kruopos", 30, "g"), mkI("Edamame in brine", "Edamame pupelės sūryme", 50, "g"), mkI("Olive oil", "Alyvuogių aliejus", 10, "g"), mkI("Pumpkin seeds", "Moliūgų sėklos", 10, "g"), mkI("Carrot", "Morka", 50, "g"), mkI("Broccoli", "Brokolis", 50, "g"), mkI("Tomato", "Pomidoras", 50, "g"), mkI("Tahini paste", "Sezamų pasta", 10, "g"), mkI("Lemon juice", "Citrinos sultys", 5, "ml"), mkI("Avocado (¼)", "Avokadas (¼)", 25, "g")],
                    method: { en: "Cook millet in salted water. Blanch broccoli with boiling water for 1 min. Layer millet in bowl, top with sliced carrot, blanched broccoli, tomato and edamame. Dress with pumpkin seeds and tahini thinned with lemon juice. Add avocado on the side.", lt: "Kruopas išvirti. Brokolį aplieti verdančiu vandeniu 1 min. Į dubenėlį sudėti soras, ant jų morką, brokolį, pomidorą ir Edamame. Pagardinti moliūgų sėklomis ir Tahini pasta su citrinos sultimis. Pridėti avokado." }
                }
            },
            snack: {
                both: {
                    name: { en: "Nuts", lt: "Riešutai" }, emoji: "🥜", kcal: 125, protein: 4, carbs: 2, fat: 11,
                    ing: [mkI("Nuts", "Riešutai", 20, "g")],
                    method: { en: "Eat nuts.", lt: "Suvalgyti riešutus." }
                }
            },
            dinner: {
                both: {
                    name: { en: "Greek salad with baked tofu & black olives", lt: "Graikiškos salotos su keptu tofu ir alyvuogėmis" }, emoji: "🥗", kcal: 461, protein: 25, carbs: 11, fat: 36,
                    ing: [mkI("Natural tofu", "Natūralus tofu", 150, "g"), mkI("Black olives", "Juodos alyvuogės", 40, "g"), mkI("Tomato", "Pomidoras", 100, "g"), mkI("Cucumber", "Agurkas", 100, "g"), mkI("Spinach", "Špinatai", 25, "g"), mkI("Iceberg lettuce", "Aisbergo salotos", 25, "g"), mkI("Pumpkin seeds", "Moliūgų sėklos", 10, "g"), mkI("Olive oil", "Alyvuogių aliejus", 15, "g")],
                    method: { en: "Dice tofu and fry in pan with a little oil. Splash with GF soy sauce at the end. Prepare salad from tomato, cucumber, spinach and iceberg. Dress with 1 tsp olive oil, a little vinegar, salt and herbs. Top with tofu, black olives and pumpkin seeds.", lt: "Tofu supjaustyti kubeliais ir pakepinti su a.š. aliejaus, baigiant apšlakstyti sojos padažu. Iš pomidorų, agurko, špinatų ir aisbergo paruošti salotas, pagardinti aliejumi, actu, druska, žolelėmis. Ant viršaus uždėti tofu, alyvuoges ir sėklas." }
                }
            }
        }
    }
];

export const TIPS = {
    en: [
        { icon: "🍽️", title: "Eating Schedule", body: "Eat 3–4 times per day — do not eat less frequently. Follow the schedule: Breakfast → Lunch → Dinner + 1 snack. Each meal already meets the calorie and nutrient targets. The closer you follow the structure (especially the first month) the better your results. Do not eat 2–3 hours before sleep." },
        { icon: "🧘", title: "During Meals", body: "Avoid other activities while eating (reading, TV, computer, driving). This also applies to snacks. Focusing fully on eating helps you feel fuller, enjoy food more, and understand your portion sizes." },
        { icon: "🌿", title: "General Tips", body: "Do not lie down or bend immediately after eating. Avoid tight clothing around the waist (especially after meals). Do not chew gum or drink fizzy / hot drinks immediately after food." },
        { icon: "🥗", title: "Fat Content", body: "Choose products without visible fat (lean meat). Use low-fat lactose-free dairy. Avoid fatty sauces and deep-fried products. Cook meat/fish in the oven or cast-iron pan without added oil — boil or steam. Add oil only to the finished dish." },
        { icon: "🔥", title: "Avoid Inflammatory Foods", body: "Avoid rapeseed oil and sunflower oil. Also avoid products made from white wheat flour and its varieties (bulgur, couscous, spelt, wheat bran), rye, barley, semi-finished products and canned goods." },
        { icon: "🌾", title: "Fibre & Vegetables", body: "You can increase vegetable portions by 100–150g beyond the plan. Do not increase olives, canned vegetables or oil. Roasted vegetables can replace fresh ones. Avoid pickled vegetables. Eat fruit moderately from the recommended list; peel skins where possible. Soak nuts overnight in cold water with a pinch of salt; pat dry in the morning." },
        { icon: "💧", title: "Fluids", body: "Drink 1.7–2.2 litres of unsweetened fluids daily: water and herbal tea. Avoid coffee and tea immediately after meals — wait at least 30 minutes. Always choose still water as first choice, optionally flavoured with lemon or herbs." },
        { icon: "🔄", title: "Product Substitutions", body: "In the recommended/not recommended products table you will find food alternatives that you can freely swap within the meal plan, keeping the same quantity. Ask the dietitian if in doubt." }
    ],
    lt: [
        { icon: "🍽️", title: "Valgymo režimas", body: "3–4 valgymai per dieną — nerekomenduojama valgyti rečiau. Režimas: Pusryčiai → Pietūs → Vakarienė + užkandis. Kiekvienas patiekalas atitinka kaloražą ir maistinių medžiagų kiekius. Kuo tiksliau laikysitės plano struktūros (ypač pirmuoju mėnesiu), tuo geresnių rezultatų galite tikėtis. Nevalgykite bent 2–3 val. iki miego." },
        { icon: "🧘", title: "Elgesys valgio metu", body: "Valgant nerekomenduojama užsiimti kita veikla (skaitymu, darbu kompiuteriu, žiūrėjimu TV, vairavimu ir pan.). Tai taikoma ir valgant užkandžius. Koncentruojantis į valgymą pajausite didesnį sotumo jausmą ir suprasite kiek suvalgote." },
        { icon: "🌿", title: "Rekomenduojama", body: "Negulėti, nesilankstyti iškart po valgio. Vengti drabužių, spaudžiančių juosmenį (ypač pavalgius). Nekramtyti gumos, gerti gazuotų arba karštų gėrimų iš karto po maisto." },
        { icon: "🥗", title: "Riebalų kiekis maiste", body: "Rinkitės maisto produktus be matomų riebalų (liesa mėsa), liesus pieno produktus be laktozės. Venkite riebių padažų ir riebaluose keptų produktų. Mėsą, žuvį kepti orkaitėje arba ketaus keptuvėje be pridėtinio aliejaus, virti ar garinti. Aliejų pilti ant jau iškepto patiekalo." },
        { icon: "🔥", title: "Venkite uždegimą didinančių produktų", body: "Venkite rapsų ir saulėgrąžų aliejų. Taip pat venkite maisto produktų iš baltų kvietinių miltų ir jų atmainų (bulgur, kuskusas, spelta, kviečių sėlenos), rugių, miežių, pusfabrikačių ir konservų." },
        { icon: "🌾", title: "Skaidulos ir daržovės", body: "Daržovių kiekius galima didinti papildomai 100–150g. Nerekomenduojama didinti alyvuogių, konservuotų daržovių ar aliejaus kiekių. Troštinta arba orkaitėje apkeptos daržovės gali pakeisti šviežias. Vengti marinuotų daržovių. Vaisiai valgomi saikingai pagal rekomenduojamų sąrašą, odeles nulupti kur įmanoma. Riešutus mirkyti vandenyje per naktį su žiupsneliu druskos, ryte išdžiovinti." },
        { icon: "💧", title: "Skysčiai", body: "Kasdien išgerkite 1,7–2,2 l nesaldžių skysčių: vandens ir arbatos. Kavos ir arbatos vartojimo iš karto po pagrindinio valgymo venkite — palaukite bent 30 minučių. Pirmuoju pasirinkimu visada bus stalo vanduo — natūralus arba gardintas citrina, prieskoninėmis žolelėmis." },
        { icon: "🔄", title: "Produktų alternatyvos", body: "Rekomenduojamų/nerekomenduojamų produktų lentelėje rasite maisto produktų alternatyvas, kurias galite keisti mitybos plane savo nuožiūra išlaikydami bendrą produkto kiekį. Jei abejojate — pasitarkite su dietologu." }
    ]
};