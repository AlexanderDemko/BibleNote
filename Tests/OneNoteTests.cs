using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Threading.Tasks;
using BibleNote.Domain.Entities;
using BibleNote.Domain.Enums;
using BibleNote.Providers.OneNote.Contracts;
using BibleNote.Providers.OneNote.Services.DocumentProvider;
using BibleNote.Providers.OneNote.Services.Models;
using BibleNote.Providers.OneNote.Services.NavigationProvider;
using BibleNote.Services.DocumentProvider.Contracts;
using BibleNote.Services.DocumentProvider.Models;
using BibleNote.Services.NavigationProvider.Contracts;
using BibleNote.Services.VerseProcessing.Contracts;
using BibleNote.Tests.TestsBase;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace BibleNote.Tests
{
    [TestClass]
    public class OneNoteTests : DbTestsBase
    {
        private IDocumentProvider documentProvider;
        private IOneNoteAppWrapper oneNoteApp;
        private IAnalyzer analyzer;
        private INavigationProviderService navigationProviderService;
        private IOrderedEnumerable<IDocumentParseResultProcessing> documentParseResultProcessings;

        [TestInitialize]
        public void Init()
        {
            base.Init();

            this.documentProvider = ServiceProvider.GetService<OneNoteProvider>();
            this.oneNoteApp = ServiceProvider.GetService<IOneNoteAppWrapper>();
            this.analyzer = ServiceProvider.GetService<IAnalyzer>();
            this.navigationProviderService = ServiceProvider.GetService<INavigationProviderService>();
            this.documentParseResultProcessings = ServiceProvider.GetServices<IDocumentParseResultProcessing>()
                .OrderBy(rp => rp.Order);
        }

        [TestCleanup]
        public void Done()
        {

        }

        [TestMethod]
        public async Task TestAnalyzer()
        {
            var currentSectionId = await this.oneNoteApp.GetCurrentSectionIdAsync();
            var sectionInfo = await this.oneNoteApp.GetHierarchyInfoAsync(currentSectionId);
            if (sectionInfo.Name != "Test Section")
                throw new InvalidOperationException("Should check 'Test Section' only");

            var navigationProviderInfo = new NavigationProviderInfo()
            {
                Name = "Test OneNote provider",
                Type = NavigationProviderType.OneNote,
                Description = "Test OneNote navigation provider",
                IsReadonly = true,
                ParametersRaw = new OneNoteNavigationProviderParameters()
                {
                    HierarchyItems = new List<OneNoteHierarchyInfo>() 
                    { 
                        new OneNoteHierarchyInfo() { Id = currentSectionId, Type = OneNoteHierarchyType.Section, Name = "Test section" }
                    }
                }
                .GetParametersRaw()
            };

            try
            {
                DbContext.NavigationProvidersInfo.Add(navigationProviderInfo);
                await DbContext.SaveChangesAsync();

                var navigationProvider = ServiceProvider.GetService<OneNoteNavigationProvider>();
                navigationProvider.SetParameters(navigationProviderInfo);

                var initialVersesCount = await DbContext.VerseEntryRepository.CountAsync();

                var session = await this.analyzer.AnalyzeAsync(navigationProvider, new AnalyzerOptions()
                {
                    Depth = AnalyzeDepth.All
                });

                session.CreatedDocumentsCount.Should().Be(3);
                session.UpdatedDocumentsCount.Should().Be(0);
                session.DeletedDocumentsCount.Should().Be(0);

                Assert.AreEqual(initialVersesCount + 53, await DbContext.VerseEntryRepository.CountAsync());
            }
            finally
            {
                await this.navigationProviderService.DeleteNavigationProvider(navigationProviderInfo.Id);
            }
        }       
    }
}
