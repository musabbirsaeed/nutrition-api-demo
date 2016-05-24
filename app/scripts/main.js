(function(Eventi, HTML, store, Clone, Posterior) {
    'use strict';

    var _ = window.app = {
        api: new Posterior({
            url: '/api',
            debug: true,
            throttle: { key: 'staging', ms: 510 },// allow ~2 calls/second
            requestData: function(data) {
                _.saveCommunications('request', data, this);
            },
            load: function() {
                _.saveCommunications('response', this.response, this.cfg);
            },
            failure: function(e){ _.error(e); },

            '@foodunits': {
                url: '/food-units',
                saveResult: true,
                responseData: function(list) {
                    return _.buildResource(list, 'foodunits');
                }
            },
            '@nutrients': {
                url: '/nutrients',
                saveResult: true,
                responseData: function(list) {
                    return _.buildResource(list, 'nutrients');
                }
            },
            '@search': {
                requires: ['app.api.foodunits'],
                url: '/foods?query={query}&count={count}&start={start}&spell={spell}'
            },
            '@view': {
                requires: ['app.api.foodunits', 'app.api.nutrients'],
                url: '/food/{0}',
                then: function(food) {
                    food.nutrient_data = food.nutrient_data.filter(function(datum) {
                        // limit demo to calories
                        return datum.nutrient === 'urn:uuid:a4d01e46-5df2-4cb3-ad2c-6b438e79e5b9';
                    });
                    // override actual data to hide all nutrients but calories
                    var coms = store('response');
                    coms.data = food;
                    store('response', coms);
                    return food;
                }
            },
            '@analyze': {
                requires: ['app.api.nutrients', 'app.api.foodunits'],
                method: 'POST',
                headers: {
                    'Content-Type': 'application/vnd.com.esha.data.Foods+json'
                },
                url: '/analysis'
            }
        }),

        saveCommunications: function(direction, data, cfg) {
            var coms = {
                direction: direction,
                body: data,
                method: cfg.method || 'GET',
                url: Posterior.api
                        .resolve(cfg.url, cfg.data, null, false)
                        .replace(_.base, '')
            };
            if (direction === 'response') {
                var xhr = cfg.xhr;
                coms.headers = xhr.responseHeaders;
                coms.status = xhr.status;
            } else {
                coms.headers = cfg.headers;
            }
            store(direction, coms);
            _.updateAPI();
        },
        buildResource: function(list, saveAs) {
            var hash = {};
            list.forEach(function(member) {
                hash[member.id] = member;
            });
            _[saveAs] = hash;
            // save network coms too
            store(saveAs+'.response', store('response'));
            store(saveAs+'.request', store('request'));
            hash.__list__ = list;
            return hash;
        },

        search: function(e, path, query) {
            var options = HTML.query('#options',1),
                params = options.classList.contains('hidden') ? {} : options.values(),
                input = HTML.query('input[name=query]');
            if (query) {
                params.query = query;
                input.value = decodeURIComponent(query);
            } else {
                params.query = encodeURIComponent(input.value);
            }
            if (params.query) {
                path = '#query='+params.query;
                if (location.hash !== path) {
                    Eventi.fire.location(path);
                }
                HTML.query('#results').values('query', params.query);
            } else {
                input.focus();
            }
            _.query('search', params);
        },
        query: function(name, params) {
            _.api.search(params).then(function(results) {
                _.results(results);
                _.controls(results);
            });
        },
        controls: function(results) {
            var pages = Object.keys(results).filter(function(key) {
                return key.indexOf('_page') > 0;
            });
            HTML.query('[click=page]').each(function(el) {
                el.classList.toggle('hidden', !results.total || pages.indexOf(el.id+'_page') < 0);
            });
        },
        page: function(e) {
            var coms = store('response'),
                results = coms.body,
                page = e.target.id+'_page',
                url = results && results[page];
            if (url) {
                _.query(url);
            }
        },
        options: function() {
            HTML.query('#options').classList.toggle('hidden');
        },
        results: function(results) {
            var all = HTML.query('#results'),
                items = all.query('[clone]');
            items.innerHTML = '';
            results.items.forEach(_.processFoodUnits);
            items.clone(results.items);

            var feedback = all.query('#feedback'),
                url = HTML.values('url'),
                start = url && url.match(/start=(\d+)/);
            results.start = start && parseInt(start[1]) || 0;
            results.end = results.start + results.items.length - 1;
            feedback.classList.toggle('hidden', !results.items.length);
            feedback.values(results);

            var param = HTML.query('input[name=query]').value;
            all.classList.toggle('misspelled', results.query !== param);
        },
        items: store('list')||[],
        list: function() {
            var all = HTML.query('#list'),
                items = all.query('[clone]');
            if (items.children.length !== _.items.length) {
                setTimeout(function() {
                    items.innerHTML = '';
                    items.clone(_.items);
                    items.queryAll('.food').each(function(item, i) {
                        var values = _.items[i],
                            unit = item.query('[name=unit]');
                        Clone.init(unit);
                        unit.clone(values.units);
                        unit.value = values.unit.id;
                    });
                    store('list', _.items);
                }, 100);
            }
        },
        add: function() {
            _.items.push(this.cloneValues);
            Eventi.fire.location('#list');
        },
        prepInline: function(vals) {
            var inline = HTML.query('#inline'),
                units = inline.query('select[name=unit]');
            if (!vals || !vals.quantity) {
                vals = {
                    quantity: 1,
                    calories: '',
                    input: '',
                    unit: 'urn:uuid:85562e85-ba37-4e4a-8400-da43170204a7'//Each
                };
            }
            _.api.foodunits().then(function() {
                units.clone(_.foodunits.__list__);
                inline.values(vals);
                units.value = vals.unit;
            });
        },
        inlineBaseUri: 'http://www.example.com/',
        inline: function() {
            var inline = HTML.query('#inline'),
                input = inline.values('input'),
                unit = _.foodunits[inline.query('[name=unit]').value],
                food = {
                    id: _.inlineBaseUri+input.replace(/ /g,''),
                    description: input,
                    quantity: inline.values('quantity'),
                    unit: unit,
                    nutrient_data: [{
                        nutrient: inline.values('nutrient'),
                        value: inline.values('value')
                    }],
                    product: '-inline-',
                    units: [unit]
                };
            _.items.push(food);
            Eventi.fire.location('#list');
        },
        view: function(e, path, id) {
            if (id) {
                _.api.view(id).then(function viewFood(food) {
                    var view = HTML.query('#view'),
                        values = view.query('[clone].values');
                    _.processFoodUnits(food);
                    food.units = food.units.map(function(unit) {
                        return unit.description;
                    }).join(', ');
                    food.tags = food.tags.join(', ');
                    view.values(food);
                    values.innerHTML = '';
                    food.nutrient_data.forEach(_.processNutrientDatum);
                    values.clone(food.nutrient_data);
                }).catch(_.error);
            } else {
                id = this.cloneValues.id;
                if (id.startsWith(_.inlineBaseUri)) {
                    Eventi.fire.location('#list');
                } else {
                    Eventi.fire.location('#view/'+id);
                }
            }
        },
        processFoodUnits: function(food) {
            food.unit = _.foodunits[food.unit] || food.unit;
            if (food.units) {
                food.units = food.units.map(function(unit) {
                    return _.foodunits[unit] || unit;
                });
            }
        },
        processNutrientDatum: function(datum) {
            datum.value = Math.round(datum.value * 10) / 10;
            datum.nutrient = _.nutrients[datum.nutrient] || datum.nutrient;
        },
        update: function(e) {
            var index = this.getAttribute('index'),
                values = _.items[index],
                name = e.target.getAttribute('name'),
                value = e.target.value;
            values[name] = name === 'unit' ? _.foodunits[value] : value;
        },
        remove: function() {
            var index = this.nearest('[index]').getAttribute('index');
            _.items.splice(index, 1);
            _.list();
        },
        clear: function() {
            _.items = [];
            _.list();
        },
        analyze: function(e) {
            var foodlist = { items: [] };
            _.items.forEach(function(item) {
                var food = {
                    id: item.id,
                    quantity: item.quantity,
                    unit: item.unit.id
                };
                if (item.nutrient_data) {
                    food.description = item.description;
                    food.nutrient_data = item.nutrient_data;
                }
                foodlist.items.push(food);
            });
            _.api.analyze(foodlist).then(function(response) {
                _.analysis(response);
                if (e.type !== 'location') {
                    Eventi.fire.location('#analysis');
                }
            });
        },
        analysis: function(response) {
            // location events not welcome
            if (response.type === 'location') {
                return _.analyze(response);
            }
            response.items.forEach(function(item) {
                item.unit = _.foodunits[item.unit] || item.unit;
            });
            response.results.forEach(_.processNutrientDatum);
            var el = HTML.query('#analysis'),
                values = el.query('[clone].values'),
                items = el.query('[clone].items');
            values.innerHTML = '';
            items.innerHTML = '';
            values.clone(response.results);
            items.clone(response.items);
        },
        network: function(direction, e) {
            var coms = store(direction);
            coms.body = JSON.stringify(coms.body, null, 2);
            if (coms.body.length < 3) {
                coms.body = '';
            }
            coms.headers = JSON.stringify(coms.headers, null, 1)
                .replace(/",?/g, '')// quotes and commas
                .substring(2).replace('\n}','\n')// parentheses
            ;
            HTML.query('[name="network"]').values(coms);
            _.updateAPI(coms);
            if (e.type !== 'location') {
                Eventi.fire.location('#'+direction);
            }
        },
        updateAPI: function(request) {
            HTML.query('.api').values(request || store('request'));
        },
        error: function(e) {
            var response = store('response'),
                message = response.body && response.body.messages ?
                    response.body.messages[0] :
                    { text: e.type === 'location' ? '' : e };
            message.status = response.status;
            HTML.query('[name=error]').values(message);
            if (!e || e.type !== 'location') {
                Eventi.fire.location('#error');
            }
        },
        resource: function(e, path, name) {
            _.api[name]().then(function(response) {
                var container = HTML.query('[vista="'+name+'"] [clone]');
                container.innerHTML = '';
                container.clone(response.__list__);
                // restore cached network coms
                store('response', store(name+'.response'));
                store('request', store(name+'.request'));
                _.updateAPI();
            });
        }
    };

    Eventi.alias('location');
    Eventi.on(window, {
        'location@`#(nutrients|foodunits)`': _.resource,
        'location@#request': _.network.bind(_, 'request'),
        'location@#response': _.network.bind(_, 'response'),
        'location@#query={query}': _.search,
        'location@#list': _.list,
        'location@#analysis': _.analysis,
        'location@#view/{uri}': _.view,
        'location@#inline': _.prepInline,
        'location@#error': _.error,
        'search': _.search,
        'items:add<.food>': _.add,
        'items:inline<.food>': _.inline,
        'items:view<.food>': _.view,
        'items:remove<.food>': _.remove,
        'items:clear': _.clear,
        'items:analyze': _.analyze,
        'page': _.page,
        'options': _.options,
        'change<.food>': _.update
    });

})(window.Eventi, document.documentElement, window.store, window.Clone, window.Posterior);