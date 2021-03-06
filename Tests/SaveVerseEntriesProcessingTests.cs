﻿using System.Linq;
using System.Threading.Tasks;
using BibleNote.Domain.Entities;
using BibleNote.Providers.FileSystem.DocumentId;
using BibleNote.Providers.Html;
using BibleNote.Providers.Html.Contracts;
using BibleNote.Services.Contracts;
using BibleNote.Services.VerseProcessing.Contracts;
using BibleNote.Tests.TestsBase;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace BibleNote.Tests
{
    [TestClass]
    public class SaveVerseEntriesProcessingTests : DbTestsBase
    {
        private IDocumentProvider documentProvider;
        private IDocumentParseResultProcessing documentParseResultProcessing;
        private Document document;

        [TestInitialize]
        public async Task Init()
        {
            base.Init(services => services
                .AddTransient<IHtmlDocumentConnector, HtmlDocumentConnector>()
                .AddTransient<IDocumentProvider, HtmlProvider>());

            this.documentProvider = ServiceProvider.GetService<IDocumentProvider>();
            this.documentParseResultProcessing = ServiceProvider.GetServices<IDocumentParseResultProcessing>()
                .OrderBy(rp => rp.Order)
                .First();

            this.document = await GetOrCreateDocument();
        }

        [TestCleanup]
        public override void Cleanup()
        {
            base.Cleanup();
        }

        [TestMethod]
        public async Task Test1()
        {
            var parseResult = await this.documentProvider.ParseDocumentAsync(new FileDocumentId(0, @"..\..\..\TestData\Html_CheckFullPage.html", true));
            await this.documentParseResultProcessing.ProcessAsync(this.document.Id, parseResult);

            this.DbContext.VerseEntryRepository
                .Where(v => v.DocumentParagraph.DocumentId == this.document.Id)
                .Count()
                .Should()
                .Be(19);

            this.DbContext.DocumentParagraphRepository
                .Where(p => p.DocumentId == this.document.Id)
                .Count()
                .Should()
                .Be(11);
        }
    }
}
