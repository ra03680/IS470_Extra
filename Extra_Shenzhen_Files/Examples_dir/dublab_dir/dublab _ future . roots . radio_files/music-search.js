var dubsearch = new function() {
    var facets = ["artists", "genres", "show_year"];
    var content = ["title", "featured_image", "post_date", "post_name"];
    var resultsSelector = ".search-results";
    var pageSize = 16;

    var facetToModel = {
        "artists": "artists",
        "show_year": "showYears",
        "genres": "genres"
    };

    this.Mode = {
        FACETS_ONLY: "FACETS_ONLY",
        FACETS_AND_RESULTS: "FACETS_AND_RESULTS"
    };

    var ViewModel = function(indexName, mode) {
        var self = this;
        self.mode = mode;
        self.searchPath = "/es/" + indexName + "/_search";

        self.artists = ko.observableArray();
        self.selectedArtists = ko.observableArray();
        self.showYears = ko.observableArray();
        self.selectedShowYears = ko.observableArray();
        self.genres = ko.observableArray();
        self.selectedGenres = ko.observableArray();

        self.results = ko.observableArray();
        self.totalResults = ko.observable();
        self.currentPage = ko.observable(1);

        self.refreshing = ko.observableArray();

        function makeFacetRefreshing(facet) {
            return ko.computed(function() {
                return _.contains(self.refreshing(), facet);
            });
        }

        self.artistsRefreshing = makeFacetRefreshing("artists");
        self.genresRefreshing = makeFacetRefreshing("genres");
        self.showYearsRefreshing = makeFacetRefreshing("show_year");

        self.totalPages = ko.computed(function() {
            return Math.ceil(self.totalResults() / pageSize);
        });

        self.optionsOf = function (facet) {
            return this[facetToModel[facet]];
        };

        self.selectedOf = function (facet) {
            var options = facetToModel[facet];
            var selected = "selected"
                + options.substr(0, 1).toUpperCase()
                + options.substr(1);
            return this[selected];
        };

        self.facetFilter = function(facet) {
            var selectedFilters = _.map(
                self.selectedOf(facet).peek(),
                function (term) {
                    return {"term": dict(
                        [originalOf(facet), term]
                    )};
                }
            );

            return _.isEmpty(selectedFilters)
                ? null
                : {"or": selectedFilters};
        };

        self.updateFacet = function(facet, response) {
            var items = response.facets[originalOf(facet)].terms;
            var options = self.optionsOf(facet);

            var sortedTerms = _.sortBy(items, function (item) {
                return item.term;
            });

            options(sortedTerms);
        };

        self.updateResults = function(scrollTop, response) {
            var rawResults = _.pluck(response.hits.hits, "fields");

            var flushResults = function() {
                self.results(_.map(rawResults, makeResult));
                self.totalResults(response.hits.total);
                self.setFragmentQuery();

                // TODO: should refactor as bindings instead of imperative code
                jQuery(resultsSelector).css("opacity", "1");
            };

            if ( scrollTop ) {
                jQuery('html, body').animate({
                    scrollTop: jQuery(resultsSelector).offset().top - 100
                }, {
                    complete: flushResults
                }, 200);
            }
            else {
                flushResults();
            }
        };

        self.movePage = function(direction, scrollTop) {
            return function() {
                var current = self.currentPage();
                self.currentPage(current + direction);
                self.refreshResults(scrollTop);
            };
        };

        self.refreshResults = function(scrollTop) {
            var searchDoc = {
                "fields": facets.concat(content),
                "query": self.makeQuery(facets),
                "from": (self.currentPage() - 1) * pageSize,
                "size": pageSize,
                "sort": [
                    {"post_date.original": "desc"}
                ]
            };

            // TODO: should refactor as bindings instead of imperative code
            jQuery(resultsSelector).css("opacity", "0.5");

            doSearch(self.searchPath, searchDoc, _.partial(self.updateResults, scrollTop));
        };

        self.makeQuery = function(filterFacets) {
            var facetFilters = _.filter(
                _.map(filterFacets, self.facetFilter),
                notNull
            );

            return {
                "constant_score": {
                   "filter": _.isEmpty(facetFilters)
                       ? {"match_all": {}}
                       : {"and": facetFilters}
                }
            };
        };

        self.facetSearchDoc = function(facet) {
            var filterFacets = _.first(facets, _.indexOf(facets, facet));
            return {
                "query": self.makeQuery(filterFacets),
                "facets": makeFacets(facet)
            };
        };

        self.refreshFacet = function(barrier, facet) {
            var searchDoc = self.facetSearchDoc(facet);
            var success = _.compose(barrier, _.partial(self.updateFacet, facet));
            doSearch(self.searchPath + "?search_type=count", searchDoc, success);
        };

        self.clearSelections = function() {
            self.refreshing(facets);
            self.selectedArtists([]);
            self.selectedGenres([]);
            self.selectedShowYears([]);
            self.currentPage(1);
            self.refreshing([]);
            self.doRefresh();
        };

        self.setFragmentQuery = function() {
            var facetSelectionPairs = _.map(facets, function (facet) {
                return [facet, self.selectedOf(facet)()];
            });
            var pagePair = ["page", self.currentPage()];
            var query = _.object(facetSelectionPairs.concat([pagePair]));

            var newUri = URI(document.location).fragment(query);
            document.location = newUri.toString();
        };

        self.doRefresh = function(changedFacet, afterFacets) {
            // Prevent reentrance due to our programmatic changes to the observed
            // arrays of facet item selections.
            if ( ! _.isEmpty(self.refreshing()) )
                return;

            // Only those facets to the right of the one changed are refreshed.
            // No changedFacet indicates we're doing the initial load and want
            // to refresh everything.
            var toRefresh = _.isString(changedFacet)
                ? _.rest(facets, _.indexOf(facets, changedFacet) + 1)
                : facets;

            self.refreshing(toRefresh);

            var doResults = self.mode == dubsearch.Mode.FACETS_AND_RESULTS;

            var afterRefresh = function() {
                if ( _.isFunction(afterFacets) ) {
                    afterFacets();
                }

                self.refreshing([]);

                if ( doResults ) {
                    if ( changedFacet ) {
                        self.currentPage(1);
                    }
                    self.refreshResults();
                }

            }

            if ( _.isEmpty(toRefresh) ) {
                afterRefresh();
            }
            else {
                var barrier = makeBarrier(toRefresh.length, afterRefresh);
                _.each(toRefresh, _.partial(self.refreshFacet, barrier));
            }
        };
    };

    function defaultTo(value, defaultValue, mapper) {
        var value = _.isUndefined(value) ? defaultValue : value;

        if ( _.isUndefined(mapper) ) {
            return value;
        }
        else {
            return mapper(value);
        }
    }

    function commaJoin(resultValue) {
        // HACK: not sure why single strings are showing up here for e.g. artist
        if ( _.isString(resultValue) ) {
            return resultValue;
        }
        else if ( _.isArray(resultValue) ) {
            return resultValue.join(", ")
        }
        else {
            return undefined;
        }
    }

    function makeResult(rawResult, index) {
        return _.extend(rawResult, {
            "artists": defaultTo(rawResult.artists, ["Unknown"], commaJoin),
            "genres": defaultTo(rawResult.genres, ["Unknown"], commaJoin),
            "show_year": defaultTo(rawResult.show_year, "Unknown"),
            "post_url": "/" + rawResult.post_name,
            "even_post": index % 2 == 0,
            "odd_post": index % 2 == 1
        });
    }

    function originalOf(facet) {
        return facet + ".original";
    }

    function dict() {
        var dictionary = {};
        _.each(arguments, function (pair) {
            var key = pair[0];
            var value = pair[1];
            dictionary[key] = value;
        });
        return dictionary;
    }

    function notNull(value) {
        return value != null;
    }

    function makeFacets(facet) {
        return dict([
            originalOf(facet),
            {
                "terms": {
                    "field": originalOf(facet),
                    "size": 10000
                }
            }
        ]);
    }

    function doSearch(url, searchDoc, success) {
        jQuery.ajax({
            url: url,
            type: "POST",
            success: success,
            data: JSON.stringify(searchDoc)
        });
    }

    function makeBarrier(pendingCalls, proceed) {
        var calls = 0;
        return function() {
            calls++;
            if ( calls == pendingCalls )
                proceed();
        }
    }

    this.facetToText = function(facet) {
        return facet.term + " (" + facet.count + ")";
    };

    this.facetToValue = function(facet) {
        return facet.term;
    };

    function loadQuerySelections(viewModel) {
        var uri = URI(document.location);

        var fragment = uri.fragment(true);
        var query = uri.query(true);

        var toLoad = _.isEmpty(fragment) ? query : fragment;

        _.each(facets, function (facet) {
            if ( _.has(toLoad, facet) ) {
                var selections = _.isArray(toLoad[facet])
                    ? toLoad[facet] 
                    : [toLoad[facet]];

                viewModel.selectedOf(facet)(selections);
            }
        });

        if ( _.has(toLoad, "page") ) {
            viewModel.currentPage(parseInt(toLoad["page"]));
        }
    }

    this.boot = function(bindElement, indexName, mode) {
        var viewModel = new ViewModel(indexName, mode);
        loadQuerySelections(viewModel);

        _.each(facets, function (facet) {
            var doRefresh = _.partial(viewModel.doRefresh, facet);
            viewModel.selectedOf(facet).subscribe(doRefresh);
        });

        viewModel.doRefresh(null, function () {
            ko.applyBindings(viewModel, bindElement);
        });

        return viewModel;
    };
};

// vim: ts=4:st=4:expandtab
