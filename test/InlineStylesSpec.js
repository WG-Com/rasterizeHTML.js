describe("Import styles", function () {
    var doc, loadCSSImportsForRulesSpy, loadAndInlineCSSResourcesForRulesSpy;

    var fulfilled = function (value) {
        var defer = ayepromise.defer();
        defer.resolve(value);
        return defer.promise;
    };

    beforeEach(function () {
        doc = document.implementation.createHTMLDocument("");

        loadCSSImportsForRulesSpy = spyOn(rasterizeHTMLInline.css, 'loadCSSImportsForRules').andReturn(fulfilled({
            hasChanges: false,
            errors: []
        }));
        loadAndInlineCSSResourcesForRulesSpy = spyOn(rasterizeHTMLInline.css, 'loadAndInlineCSSResourcesForRules').andCallFake(function (cssRules, options, callback) {
            callback(false, []);
        });
        spyOn(rasterizeHTMLInline.util, 'clone').andCallFake(function (object) {
            return object;
        });
    });

    it("should do nothing if no CSS is found", function (done) {
        rasterizeHTMLInline.loadAndInlineStyles(doc, function () {
            expect(loadCSSImportsForRulesSpy).not.toHaveBeenCalled();

            done();
        });
    });

    it("should not touch unrelated CSS", function (done) {
        rasterizeHTMLTestHelper.addStyleToDocument(doc, "span { padding-left: 0; }");

        loadCSSImportsForRulesSpy.andCallFake(function(rules) {
            rules[0] = "fake rule";
            return fulfilled({
                hasChanges: false,
                errors: []
            });
        });
        loadAndInlineCSSResourcesForRulesSpy.andCallFake(function(rules, options, callback) {
            rules[0] = "something else";
            callback(false, []);
        });

        rasterizeHTMLInline.loadAndInlineStyles(doc, function () {
            expect(doc.head.getElementsByTagName("style")[0].textContent).toEqual("span { padding-left: 0; }");

            done();
        });
    });

    it("should replace an import with the content of the given URL", function (done) {
        rasterizeHTMLTestHelper.addStyleToDocument(doc, '@import url("that.css");');

        rasterizeHTMLInline.loadAndInlineStyles(doc, function () {
            expect(loadCSSImportsForRulesSpy).toHaveBeenCalled();
            expect(loadCSSImportsForRulesSpy.mostRecentCall.args[0][0].cssText).toMatch(/@import url\("?that.css"?\)\s*;/);

            done();
        });
    });

    it("should inline css resources", function (done) {
        rasterizeHTMLTestHelper.addStyleToDocument(doc, 'span { background-image: url("anImage.png"); }');

        rasterizeHTMLInline.loadAndInlineStyles(doc, function () {
            expect(loadAndInlineCSSResourcesForRulesSpy).toHaveBeenCalled();
            expect(loadAndInlineCSSResourcesForRulesSpy.mostRecentCall.args[0][0].cssText).toMatch(/span \{\s*background-image: url\("?anImage.png"?\)\s*;\s*\}/);

            done();
        });
    });

    it("should accept a style element without a type", function (done) {
        var styleNode = doc.createElement("style");

        styleNode.appendChild(doc.createTextNode('@import url("imported.css");'));
        doc.head.appendChild(styleNode);

        rasterizeHTMLInline.loadAndInlineStyles(doc, function () {
            expect(loadCSSImportsForRulesSpy).toHaveBeenCalled();
            expect(loadAndInlineCSSResourcesForRulesSpy).toHaveBeenCalled();

            done();
        });
    });

    it("should ignore a style element with a non CSS type", function (done) {
        var styleNode = doc.createElement("style");
        styleNode.type = "text/plain";

        styleNode.appendChild(doc.createTextNode('@import url("imported.css");'));
        doc.head.appendChild(styleNode);

        rasterizeHTMLInline.loadAndInlineStyles(doc, function () {
            expect(loadCSSImportsForRulesSpy).not.toHaveBeenCalled();
            expect(loadAndInlineCSSResourcesForRulesSpy).not.toHaveBeenCalled();

            done();
        });
    });

    it("should respect the document's baseURI", function (done) {
        var getDocumentBaseUrlSpy = spyOn(rasterizeHTMLInline.util, 'getDocumentBaseUrl').andCallThrough();
        doc = rasterizeHTMLTestHelper.readDocumentFixture("importCss.html");

        rasterizeHTMLInline.loadAndInlineStyles(doc, function () {
            expect(loadCSSImportsForRulesSpy).toHaveBeenCalledWith(jasmine.any(Object), [], {baseUrl: doc.baseURI});
            expect(loadAndInlineCSSResourcesForRulesSpy).toHaveBeenCalledWith(jasmine.any(Object), {baseUrl: doc.baseURI}, jasmine.any(Function));
            expect(getDocumentBaseUrlSpy).toHaveBeenCalledWith(doc);

            done();
        });
    });

    it("should favour explicit baseUrl over document.baseURI", function (done) {
        var baseUrl = "aBaseURI";

        doc = rasterizeHTMLTestHelper.readDocumentFixture("importCss.html");

        expect(doc.baseURI).not.toBeNull();
        expect(doc.baseURI).not.toEqual("about:blank");
        expect(doc.baseURI).not.toEqual(baseUrl);

        rasterizeHTMLInline.loadAndInlineStyles(doc, {baseUrl: baseUrl}, function () {
            expect(loadCSSImportsForRulesSpy).toHaveBeenCalledWith(jasmine.any(Object), [], {baseUrl: baseUrl});
            expect(loadAndInlineCSSResourcesForRulesSpy).toHaveBeenCalledWith(jasmine.any(Object), {baseUrl: baseUrl}, jasmine.any(Function));

            done();
        });
    });

    it("should circumvent caching if requested", function (done) {
        rasterizeHTMLTestHelper.addStyleToDocument(doc, '@import url("that.css");');

        rasterizeHTMLInline.loadAndInlineStyles(doc, {cache: 'none'}, function () {
            expect(loadCSSImportsForRulesSpy).toHaveBeenCalled();
            expect(loadCSSImportsForRulesSpy.mostRecentCall.args[2].cache).toEqual('none');
            expect(loadAndInlineCSSResourcesForRulesSpy).toHaveBeenCalled();
            expect(loadAndInlineCSSResourcesForRulesSpy.mostRecentCall.args[1].cache).toEqual('none');

            done();
        });
    });

    it("should not circumvent caching by default", function (done) {
        rasterizeHTMLTestHelper.addStyleToDocument(doc, '@import url("that.css");');

        rasterizeHTMLInline.loadAndInlineStyles(doc, function () {
            expect(loadCSSImportsForRulesSpy).toHaveBeenCalled();
            expect(loadCSSImportsForRulesSpy.mostRecentCall.args[2]).toBeTruthy();
            expect(loadAndInlineCSSResourcesForRulesSpy).toHaveBeenCalled();
            expect(loadAndInlineCSSResourcesForRulesSpy.mostRecentCall.args[1].cache).not.toBe(false);

            done();
        });
    });

    it("should cache inlined content if a cache bucket is given", function (done) {
        var cacheBucket = {};

        loadAndInlineCSSResourcesForRulesSpy.andCallFake(function (cssRules, options, callback) {
            callback(true, [{
                cssText: 'background-image { }'
            }]);
        });

        // first call
        doc = document.implementation.createHTMLDocument("");
        rasterizeHTMLTestHelper.addStyleToDocument(doc, 'background-image { url(anImage.png); }');

        rasterizeHTMLInline.loadAndInlineStyles(doc, {cacheBucket: cacheBucket}, function () {
            expect(loadCSSImportsForRulesSpy).toHaveBeenCalled();

            loadCSSImportsForRulesSpy.reset();
            loadAndInlineCSSResourcesForRulesSpy.reset();

            // second call
            doc = document.implementation.createHTMLDocument("");
            rasterizeHTMLTestHelper.addStyleToDocument(doc, 'background-image { url(anImage.png); }');

            rasterizeHTMLInline.loadAndInlineStyles(doc, {cacheBucket: cacheBucket}, function () {
                expect(loadCSSImportsForRulesSpy).not.toHaveBeenCalled();
                expect(loadAndInlineCSSResourcesForRulesSpy).not.toHaveBeenCalled();

                expect(doc.getElementsByTagName("style")[0].textContent).toMatch(/background-image\s*{\s*}/);

                done();
            });
        });
    });

    it("should not use cache inlined content if the documents' URLs don't match", function (done) {
        var cacheBucket = {};

        loadAndInlineCSSResourcesForRulesSpy.andCallFake(function (cssRules, options, callback) {
            callback(true, [{
                cssText: 'background-image { }'
            }]);
        });

        // first call
        doc = document.implementation.createHTMLDocument("");
        rasterizeHTMLTestHelper.addStyleToDocument(doc, 'background-image { url(anImage.png); }');

        rasterizeHTMLInline.loadAndInlineStyles(doc, {cacheBucket: cacheBucket}, function () {
            expect(loadCSSImportsForRulesSpy).toHaveBeenCalled();

            loadCSSImportsForRulesSpy.reset();
            loadAndInlineCSSResourcesForRulesSpy.reset();

            // second call
            doc = rasterizeHTMLTestHelper.readDocumentFixture("image.html"); // use a document with different baseUrl
            rasterizeHTMLTestHelper.addStyleToDocument(doc, 'background-image { url(anImage.png); }');

            rasterizeHTMLInline.loadAndInlineStyles(doc, {cacheBucket: cacheBucket}, function () {
                expect(loadCSSImportsForRulesSpy).toHaveBeenCalled();
                expect(loadAndInlineCSSResourcesForRulesSpy).toHaveBeenCalled();

                done();
            });
        });
    });

    it("should not cache inlined content if caching turned off", function (done) {
        var cacheBucket = {};

        // first call
        doc = document.implementation.createHTMLDocument("");
        rasterizeHTMLTestHelper.addStyleToDocument(doc, 'background-image { url(anImage.png); }');

        rasterizeHTMLInline.loadAndInlineStyles(doc, {cacheBucket: cacheBucket, cache: 'none'}, function () {
            expect(loadCSSImportsForRulesSpy).toHaveBeenCalled();

            loadCSSImportsForRulesSpy.reset();

            // second call
            doc = document.implementation.createHTMLDocument("");
            rasterizeHTMLTestHelper.addStyleToDocument(doc, 'background-image { url(anImage.png); }');

            rasterizeHTMLInline.loadAndInlineStyles(doc, {cacheBucket: cacheBucket, cache: 'none'}, function () {
                expect(loadCSSImportsForRulesSpy).toHaveBeenCalled();

                done();
            });
        });
    });

    describe("error handling", function () {

        it("should report errors", function (done) {
            loadCSSImportsForRulesSpy.andReturn(fulfilled({
                hasChanges: false,
                errors: ['import error']
            }));
            loadAndInlineCSSResourcesForRulesSpy.andCallFake(function (cssRules, options, callback) {
                callback(false, ['resource error']);
            });

            rasterizeHTMLTestHelper.addStyleToDocument(doc, '@import url("that.css");');

            rasterizeHTMLInline.loadAndInlineStyles(doc, function (errors) {
                expect(errors).toEqual(['import error', 'resource error']);

                done();
            });
        });

        it("should cache errors alongside if a cache bucket is given", function (done) {
            var cacheBucket = {};

            loadCSSImportsForRulesSpy.andReturn(fulfilled({
                hasChanges: false,
                errors: ['import error']
            }));

            // first call
            doc = document.implementation.createHTMLDocument("");
            rasterizeHTMLTestHelper.addStyleToDocument(doc, '@import url("that.css");');

            rasterizeHTMLInline.loadAndInlineStyles(doc, {cacheBucket: cacheBucket}, function () {

                // second call
                doc = document.implementation.createHTMLDocument("");
                rasterizeHTMLTestHelper.addStyleToDocument(doc, '@import url("that.css");');

                rasterizeHTMLInline.loadAndInlineStyles(doc, {cacheBucket: cacheBucket}, function (errors) {
                    expect(errors).toEqual(["import error"]);

                    done();
                });
            });
        });
    });
});
