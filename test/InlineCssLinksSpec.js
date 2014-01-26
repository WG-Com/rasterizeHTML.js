describe("Inline CSS links", function () {
    var doc, extractCssUrlSpy, joinUrlSpy, ajaxSpy,
        adjustPathsOfCssResourcesSpy, loadCSSImportsForRulesSpy, loadAndInlineCSSResourcesForRulesSpy,
        ajaxUrlMocks = {},
        callback;

    var setupAjaxMock = function () {
        ajaxSpy = spyOn(rasterizeHTMLInline.util, "ajax").andCallFake(function (url, options) {
            var defer = ayepromise.defer();

            if (ajaxUrlMocks[url + ' ' + options.baseUrl] !== undefined) {
                defer.resolve(ajaxUrlMocks[url + ' ' + options.baseUrl]);
            // try matching without base url
            } else if (ajaxUrlMocks[url] !== undefined) {
                defer.resolve(ajaxUrlMocks[url]);
            } else {
                defer.reject();
            }
            return defer.promise;
        });
    };

    var mockAjaxUrl = function () {
        var url = arguments[0],
            baseUrl = arguments.length > 2 ? arguments[1] : null,
            content = arguments.length > 2 ? arguments[2] : arguments[1],
            urlKey = baseUrl === null ? url : url + ' ' + baseUrl;

        ajaxUrlMocks[urlKey] = content;
    };

    var aCssLink = function () {
        return aCssLinkWith("url/some.css", "p { font-size: 14px; }");
    };

    var aCssLinkWith = function (url, content) {
        var cssLink = window.document.createElement("link");
        cssLink.href = url;
        cssLink.rel = "stylesheet";
        cssLink.type = "text/css";

        mockAjaxUrl(cssLink.href, content);
        // href will return absolute path, attributes.href.nodeValue relative one in Chrome
        mockAjaxUrl(cssLink.attributes.href.nodeValue, content);

        return cssLink;
    };

    var fulfilled = function (value) {
        var defer = ayepromise.defer();
        defer.resolve(value);
        return defer.promise;
    };

    beforeEach(function () {
        doc = document.implementation.createHTMLDocument("");

        extractCssUrlSpy = spyOn(rasterizeHTMLInline.css, "extractCssUrl").andCallFake(function (cssUrl) {
            if (/^url/.test(cssUrl)) {
                return cssUrl.replace(/^url\("?/, '').replace(/"?\)$/, '');
            } else {
                throw "error";
            }
        });
        joinUrlSpy = spyOn(rasterizeHTMLInline.util, "joinUrl");
        adjustPathsOfCssResourcesSpy = spyOn(rasterizeHTMLInline.css, 'adjustPathsOfCssResources');
        loadCSSImportsForRulesSpy = spyOn(rasterizeHTMLInline.css, 'loadCSSImportsForRules').andReturn(fulfilled({
            hasChanges: false,
            errors: []
        }));
        loadAndInlineCSSResourcesForRulesSpy = spyOn(rasterizeHTMLInline.css, 'loadAndInlineCSSResourcesForRules').andCallFake(function (cssRules, options, callback) {
            callback(false, []);
        });
        setupAjaxMock();

        callback = jasmine.createSpy("loadAndInlineCssCallback");
    });

    it("should do nothing if no linked CSS is found", function () {
        rasterizeHTMLInline.loadAndInlineCssLinks(doc, callback);

        expect(callback).toHaveBeenCalled();
        expect(doc.head.getElementsByTagName("style").length).toEqual(0);
    });

    it("should not touch non-CSS links", function () {
        var faviconLink = window.document.createElement("link");
        faviconLink.href = "favicon.ico";
        faviconLink.type = "image/x-icon";

        doc.head.appendChild(faviconLink);

        rasterizeHTMLInline.loadAndInlineCssLinks(doc, callback);

        expect(callback).toHaveBeenCalled();
        expect(doc.head.getElementsByTagName("style").length).toEqual(0);
        expect(doc.head.getElementsByTagName("link").length).toEqual(1);
    });

    it("should inline linked CSS", function (done) {
        doc.head.appendChild(aCssLink());

        rasterizeHTMLInline.loadAndInlineCssLinks(doc, function () {
            expect(doc.head.getElementsByTagName("style").length).toEqual(1);
            expect(doc.head.getElementsByTagName("style")[0].textContent).toEqual("p { font-size: 14px; }");
            expect(doc.head.getElementsByTagName("link").length).toEqual(0);

            done();
        });
    });

    it("should inline linked CSS without a type", function (done) {
        var noTypeCssLink = window.document.createElement("link");
        noTypeCssLink.href = 'yet_another.css';
        noTypeCssLink.rel = "stylesheet";

        doc.head.appendChild(noTypeCssLink);

        mockAjaxUrl(noTypeCssLink.href, "p { font-size: 14px; }");
        // href will return absolute path, attributes.href.nodeValue relative one in Chrome
        mockAjaxUrl(noTypeCssLink.attributes.href.nodeValue, "p { font-size: 14px; }");

        rasterizeHTMLInline.loadAndInlineCssLinks(doc, function () {
            expect(doc.head.getElementsByTagName("style").length).toEqual(1);
            expect(doc.head.getElementsByTagName("style")[0].textContent).toEqual("p { font-size: 14px; }");
            expect(doc.head.getElementsByTagName("link").length).toEqual(0);

            done();
        });
    });

    it("should inline multiple linked CSS and keep order", function (done) {
        var anotherCssLink = aCssLinkWith("url/another.css", "a { text-decoration: none; }"),
            inlineCss = window.document.createElement("style");

        inlineCss.type = "text/css";
        inlineCss.textContent = "span { margin: 0; }";

        doc.head.appendChild(aCssLink());
        doc.head.appendChild(inlineCss);
        doc.head.appendChild(anotherCssLink);

        rasterizeHTMLInline.loadAndInlineCssLinks(doc, function () {
            expect(doc.head.getElementsByTagName("style").length).toEqual(3);
            expect(doc.head.getElementsByTagName("style")[0].textContent.trim()).toEqual("p { font-size: 14px; }");
            expect(doc.head.getElementsByTagName("style")[1].textContent.trim()).toEqual("span { margin: 0; }");
            expect(doc.head.getElementsByTagName("style")[2].textContent.trim()).toEqual("a { text-decoration: none; }");
            expect(doc.head.getElementsByTagName("link").length).toEqual(0);

            done();
        });
    });

    it("should not add inline CSS if no content given", function (done) {
        var emptyCssLink = aCssLinkWith("url/empty.css", "");

        doc.head.appendChild(emptyCssLink);

        rasterizeHTMLInline.loadAndInlineCssLinks(doc, function () {
            expect(doc.head.getElementsByTagName("style").length).toEqual(0);
            expect(doc.head.getElementsByTagName("link").length).toEqual(0);

            done();
        });
    });

    it("should inline CSS imports", function (done) {
        doc.head.appendChild(aCssLink());

        rasterizeHTMLInline.loadAndInlineCssLinks(doc, function () {
            expect(loadCSSImportsForRulesSpy).toHaveBeenCalled();
            expect(loadCSSImportsForRulesSpy.mostRecentCall.args[0][0].cssText).toMatch(/p \{\s*font-size: 14px;\s*\}/);

            done();
        });
    });

    it("should inline CSS resources", function (done) {
        doc.head.appendChild(aCssLink());

        rasterizeHTMLInline.loadAndInlineCssLinks(doc, function () {
            expect(loadAndInlineCSSResourcesForRulesSpy).toHaveBeenCalled();
            expect(loadAndInlineCSSResourcesForRulesSpy.mostRecentCall.args[0][0].cssText).toMatch(/p \{\s*font-size: 14px;\s*\}/);

            done();
        });
    });

    it("should respect the document's baseURI when loading linked CSS", function (done) {
        var getDocumentBaseUrlSpy = spyOn(rasterizeHTMLInline.util, 'getDocumentBaseUrl').andCallThrough();

        doc = rasterizeHTMLTestHelper.readDocumentFixture("externalCSS.html");

        mockAjaxUrl("some.css", "p { font-size: 14px; }");

        rasterizeHTMLInline.loadAndInlineCssLinks(doc, function () {
            expect(doc.getElementsByTagName("style").length).toEqual(1);
            expect(doc.getElementsByTagName("style")[0].textContent).toEqual("p { font-size: 14px; }");
            expect(doc.getElementsByTagName("link").length).toEqual(0);

            expect(ajaxSpy.mostRecentCall.args[1].baseUrl).toEqual(doc.baseURI);
            expect(loadCSSImportsForRulesSpy.mostRecentCall.args[2].baseUrl).toEqual(doc.baseURI);
            expect(loadAndInlineCSSResourcesForRulesSpy.mostRecentCall.args[1].baseUrl).toEqual(doc.baseURI);
            expect(getDocumentBaseUrlSpy).toHaveBeenCalledWith(doc);

            done();
        });
    });

    it("should respect optional baseUrl when loading linked CSS", function (done) {
        mockAjaxUrl("some.css", "p { font-size: 14px; }");

        doc = rasterizeHTMLTestHelper.readDocumentFixtureWithoutBaseURI("externalCSS.html");

        rasterizeHTMLInline.loadAndInlineCssLinks(doc, {baseUrl: jasmine.getFixtures().fixturesPath}, function () {
            expect(ajaxSpy.mostRecentCall.args[1].baseUrl).toEqual(jasmine.getFixtures().fixturesPath);

            expect(loadCSSImportsForRulesSpy.mostRecentCall.args[2].baseUrl).toEqual(jasmine.getFixtures().fixturesPath);
            expect(loadAndInlineCSSResourcesForRulesSpy.mostRecentCall.args[1].baseUrl).toEqual(jasmine.getFixtures().fixturesPath);

            done();
        });
    });

    it("should favour explicit baseUrl over document.baseURI when loading linked CSS", function (done) {
        var baseUrl = jasmine.getFixtures().fixturesPath;

        doc = rasterizeHTMLTestHelper.readDocumentFixture("externalCSS.html");
        expect(doc.baseURI).not.toBeNull();
        expect(doc.baseURI).not.toEqual("about:blank");
        expect(doc.baseURI).not.toEqual(baseUrl);

        mockAjaxUrl("some.css", "p { font-size: 14px; }");

        rasterizeHTMLInline.loadAndInlineCssLinks(doc, {baseUrl: jasmine.getFixtures().fixturesPath}, function () {
            expect(ajaxSpy.mostRecentCall.args[1].baseUrl).toEqual(jasmine.getFixtures().fixturesPath);

            expect(loadCSSImportsForRulesSpy.mostRecentCall.args[2].baseUrl).toEqual(jasmine.getFixtures().fixturesPath);
            expect(loadAndInlineCSSResourcesForRulesSpy.mostRecentCall.args[1].baseUrl).toEqual(jasmine.getFixtures().fixturesPath);

            done();
        });
    });

    it("should map resource paths relative to the stylesheet", function (done) {
        var cssWithRelativeResource;

        cssWithRelativeResource = window.document.createElement("link");
        cssWithRelativeResource.href = "below/some.css";
        cssWithRelativeResource.rel = "stylesheet";
        cssWithRelativeResource.type = "text/css";

        doc.head.appendChild(cssWithRelativeResource);

        mockAjaxUrl("below/some.css", "some_url/",
            'div { background-image: url("../green.png"); }\n' +
            '@font-face { font-family: "test font"; src: url("fake.woff"); }');

        rasterizeHTMLInline.loadAndInlineCssLinks(doc, {baseUrl: "some_url/"}, function () {
            expect(adjustPathsOfCssResourcesSpy).toHaveBeenCalledWith("below/some.css", jasmine.any(Object));

            done();
        });
    });

    it("should circumvent caching if requested", function (done) {
        var cssLink = aCssLink();
        doc.head.appendChild(cssLink);

        rasterizeHTMLInline.loadAndInlineCssLinks(doc, {cache: 'none'}, function () {
            expect(ajaxSpy).toHaveBeenCalledWith(cssLink.attributes.href.nodeValue, {
                cache: 'none'
            });

            expect(loadCSSImportsForRulesSpy.mostRecentCall.args[2].cache).toEqual('none');
            expect(loadAndInlineCSSResourcesForRulesSpy.mostRecentCall.args[1].cache).toEqual('none');

            done();
        });
    });

    it("should not circumvent caching by default", function (done) {
        var cssLink = aCssLink();
        doc.head.appendChild(cssLink);

        rasterizeHTMLInline.loadAndInlineCssLinks(doc, function () {
            expect(ajaxSpy).toHaveBeenCalledWith(cssLink.attributes.href.nodeValue, {});

            expect(loadCSSImportsForRulesSpy.mostRecentCall.args[2].cache).not.toBe(false);
            expect(loadAndInlineCSSResourcesForRulesSpy.mostRecentCall.args[1].cache).not.toBe(false);

            done();
        });
    });

    it("should cache inlined content if a cache bucket is given", function () {
        var cacheBucket = {};

        // first call
        doc = document.implementation.createHTMLDocument("");
        doc.head.appendChild(aCssLink());

        rasterizeHTMLInline.loadAndInlineCssLinks(doc, {cacheBucket: cacheBucket}, callback);
        expect(ajaxSpy).toHaveBeenCalled();

        waitsFor(function () {
            return callback.wasCalled;
        });

        runs(function () {
            ajaxSpy.reset();
            loadCSSImportsForRulesSpy.reset();
            loadAndInlineCSSResourcesForRulesSpy.reset();

            // second call
            doc = document.implementation.createHTMLDocument("");
            doc.head.appendChild(aCssLink());

            rasterizeHTMLInline.loadAndInlineCssLinks(doc, {cacheBucket: cacheBucket}, callback);

            expect(ajaxSpy).not.toHaveBeenCalled();
            expect(loadCSSImportsForRulesSpy).not.toHaveBeenCalled();
            expect(loadAndInlineCSSResourcesForRulesSpy).not.toHaveBeenCalled();

            expect(doc.getElementsByTagName("style")[0].textContent).toEqual("p { font-size: 14px; }");
        });
    });

    it("should cache inlined content for different pages if baseUrl is the same", function () {
        var cacheBucket = {};

        joinUrlSpy.andCallThrough();

        // first call
        doc = rasterizeHTMLTestHelper.readDocumentFixture("empty1.html");
        doc.getElementsByTagName("head")[0].appendChild(aCssLink());

        rasterizeHTMLInline.loadAndInlineCssLinks(doc, {cacheBucket: cacheBucket}, callback);

        waitsFor(function () {
            return callback.wasCalled;
        });

        runs(function () {
            ajaxSpy.reset();
            loadCSSImportsForRulesSpy.reset();
            loadAndInlineCSSResourcesForRulesSpy.reset();

            // second call
            doc = rasterizeHTMLTestHelper.readDocumentFixture("empty2.html"); // use a document with different url, but same baseUrl
            doc.getElementsByTagName("head")[0].appendChild(aCssLink());

            rasterizeHTMLInline.loadAndInlineCssLinks(doc, {cacheBucket: cacheBucket}, callback);

            expect(ajaxSpy).not.toHaveBeenCalled();
            expect(loadCSSImportsForRulesSpy).not.toHaveBeenCalled();
            expect(loadAndInlineCSSResourcesForRulesSpy).not.toHaveBeenCalled();

            expect(doc.getElementsByTagName("style")[0].textContent).toEqual("p { font-size: 14px; }");
        });
    });

    it("should not cache inlined content if caching turned off", function () {
        var cacheBucket = {};

        // first call
        doc = document.implementation.createHTMLDocument("");
        doc.head.appendChild(aCssLink());

        rasterizeHTMLInline.loadAndInlineCssLinks(doc, {cacheBucket: cacheBucket, cache: 'none'}, callback);
        expect(ajaxSpy).toHaveBeenCalled();

        waitsFor(function () {
            return callback.wasCalled;
        });

        runs(function () {
            ajaxSpy.reset();

            // second call
            doc = document.implementation.createHTMLDocument("");
            doc.head.appendChild(aCssLink());

            rasterizeHTMLInline.loadAndInlineCssLinks(doc, {cacheBucket: cacheBucket, cache: 'none'}, callback);

            expect(ajaxSpy).toHaveBeenCalled();
        });
    });

    describe("error handling", function () {
        var brokenCssLink, anotherBrokenCssLink;

        beforeEach(function () {
            brokenCssLink = window.document.createElement("link");
            brokenCssLink.href = "a_document_that_doesnt_exist.css";
            brokenCssLink.rel = "stylesheet";
            brokenCssLink.type = "text/css";

            anotherBrokenCssLink = window.document.createElement("link");
            anotherBrokenCssLink.href = "another_document_that_doesnt_exist.css";
            anotherBrokenCssLink.rel = "stylesheet";
            anotherBrokenCssLink.type = "text/css";

            joinUrlSpy.andCallThrough();
        });

        it("should report an error if a stylesheet could not be loaded", function (done) {
            doc.head.appendChild(brokenCssLink);

            rasterizeHTMLInline.loadAndInlineCssLinks(doc, {baseUrl: "some_base_url/"}, function (errors) {
                expect(errors).toEqual([{
                    resourceType: "stylesheet",
                    url: "some_base_url/a_document_that_doesnt_exist.css",
                    msg: "Unable to load stylesheet some_base_url/a_document_that_doesnt_exist.css"
                }]);

                done();
            });
        });

        it("should only report a failing stylesheet as error", function (done) {
            doc.head.appendChild(brokenCssLink);
            doc.head.appendChild(aCssLink());

            rasterizeHTMLInline.loadAndInlineCssLinks(doc, function (errors) {
                expect(errors).toEqual([{
                    resourceType: "stylesheet",
                    url: "a_document_that_doesnt_exist.css",
                    msg: jasmine.any(String)
                }]);

                done();
            });
        });

        it("should report multiple failing stylesheets as error", function (done) {
            doc.head.appendChild(brokenCssLink);
            doc.head.appendChild(anotherBrokenCssLink);

            rasterizeHTMLInline.loadAndInlineCssLinks(doc, function (errors) {
                expect(errors).toEqual([jasmine.any(Object), jasmine.any(Object)]);
                expect(errors[0]).not.toEqual(errors[1]);

                done();
            });
        });

        it("should report errors from inlining resources", function (done) {
            doc.head.appendChild(aCssLink());

            loadCSSImportsForRulesSpy.andReturn(fulfilled({
                hasChanges: false,
                errors: ["import inline error"]
            }));
            loadAndInlineCSSResourcesForRulesSpy.andCallFake(function (cssRules, options, callback) {
                callback(false, ["resource inline error"]);
            });

            rasterizeHTMLInline.loadAndInlineCssLinks(doc, function (errors) {
                expect(errors).toEqual(["import inline error", "resource inline error"]);

                done();
            });
        });

        it("should report an empty list for a successful stylesheet", function (done) {
            doc.head.appendChild(aCssLink());

            rasterizeHTMLInline.loadAndInlineCssLinks(doc, function (errors) {
                expect(errors).toEqual([]);

                done();
            });
        });

        it("should cache errors alongside if a cache bucket is given", function (done) {
            var cacheBucket = {};

            loadCSSImportsForRulesSpy.andReturn(fulfilled({
                hasChanges: false,
                errors: ["import inline error"]
            }));

            // first call
            doc = document.implementation.createHTMLDocument("");
            doc.head.appendChild(aCssLink());

            rasterizeHTMLInline.loadAndInlineCssLinks(doc, {cacheBucket: cacheBucket}, function () {

                // second call
                doc = document.implementation.createHTMLDocument("");
                doc.head.appendChild(aCssLink());

                rasterizeHTMLInline.loadAndInlineCssLinks(doc, {cacheBucket: cacheBucket}, function (errors) {
                    expect(errors).toEqual(["import inline error"]);

                    done();
                });
            });
        });
    });
});
