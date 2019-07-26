using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using System.Collections.Generic;
using BibleNote.Analytics.Services.VerseParsing.Contracts;
using BibleNote.Analytics.Services.VerseParsing.Models.ParseResult;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using System;
using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using System.IO;
using BibleNote.Analytics.Providers.FileSystem.Navigation;

namespace BibleNote.Tests.Analytics.TestsBase
{
    public abstract class DocumentParserTestsBase : TestsBase
    {   
        private IVersePointerFactory versePointerFactory;
        protected IDocumentProvider documentProvider;
     

        public void Init(Action<IServiceCollection> registerServicesAction = null)
        {
            base.Init(registerServicesAction);

            this.versePointerFactory = ServiceProvider.GetService<IVersePointerFactory>();
            this.documentProvider = ServiceProvider.GetService<IDocumentProvider>();            
        }

        protected void CheckParseResult(ParagraphParseResult parseResult, params string[] expectedVerses)
        {
            Assert.AreEqual(expectedVerses.Length, parseResult.VerseEntries.Count, "Verses length is not the same. Expected: {0}. Found: {1}", expectedVerses.Length, parseResult.VerseEntries.Count);
            var verseEntries = parseResult.VerseEntries.Select(ve => ve.VersePointer);
            foreach (var verse in expectedVerses)
                Assert.IsTrue(verseEntries.Contains(this.versePointerFactory.CreateVersePointer(verse)), "Can not find the verse: '{0}'", verse);
        }

        protected void CheckParseResults(IList<ParagraphParseResult> results, params string[][] expectedResults)
        {   
            results.Count.Should().Be(expectedResults.Length);
            for (var i = 0; i < expectedResults.Length; i++)
            {
                CheckParseResult(results[i], expectedResults[i]);
            }
        }
    }
}