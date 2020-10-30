using BibleNote.Domain.Entities;
using BibleNote.Domain.Enums;
using BibleNote.Providers.FileSystem.Navigation;
using BibleNote.Services.DocumentProvider.Contracts;
using BibleNote.Services.DocumentProvider.Models;
using BibleNote.Tests.TestsBase;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;

namespace BibleNote.Tests
{
    [TestClass]
    public class AnalyzerTests : DbTestsBase
    {
        private IAnalyzer analyzer;

        [TestInitialize]
        public void Init()
        {
            base.Init();

            this.analyzer = ServiceProvider.GetService<IAnalyzer>();
        }

        [TestCleanup]
        public override void Cleanup()
        {
            base.Cleanup();
        }

        [TestMethod]
        public async Task Test1()
        {
            var testFolder = Path.Combine("c:\\temp", Guid.NewGuid().ToString());
            var testSubFolder = Path.Combine(testFolder, "testSubFolder", "testSubSubFolder");
            Directory.CreateDirectory(testSubFolder);
            var testNavProviderName = "Test provider";

            var navigationProviderInfo = new NavigationProviderInfo()
            {
                Name = testNavProviderName,
                Type = NavigationProviderType.File,
                Description = "Test File navigation provider",
                IsReadonly = true,
                ParametersRaw = new FileNavigationProviderParameters()
                {
                    FolderPaths = new List<string>() { testFolder }
                }
                   .GetParametersRaw()
            };

            try
            {
                DbContext.NavigationProvidersInfo.Add(navigationProviderInfo);
                await DbContext.SaveChangesAsync();

                var navigationProvider = ServiceProvider.GetService<FileNavigationProvider>();
                navigationProvider.SetParameters(navigationProviderInfo);

                var initialVersesCount = await DbContext.VerseEntryRepository.CountAsync();

                File.WriteAllText(Path.Combine(testFolder, "1.txt"), "Test file 1. Ин 1:1");
                File.WriteAllText(Path.Combine(testFolder, "2.txt"), "Test file 2. Ин 1:2");
                File.WriteAllText(Path.Combine(testSubFolder, "3.txt"), "Test file 3. Ин 2:2");

                var session = await this.analyzer.AnalyzeAsync(navigationProvider, new AnalyzerOptions()
                {
                    Depth = AnalyzeDepth.All
                });

                session.CreatedDocumentsCount.Should().Be(3);
                session.UpdatedDocumentsCount.Should().Be(0);
                session.DeletedDocumentsCount.Should().Be(0);

                Assert.AreEqual(initialVersesCount + 3, await DbContext.VerseEntryRepository.CountAsync());

                File.WriteAllText(Path.Combine(testFolder, "1.txt"), "Test file 1 new. Ин 3:3");
                File.WriteAllText(Path.Combine(testFolder, "4.txt"), "Test file 4 new. Ин 4:4");
                File.Delete(Path.Combine(testSubFolder, "3.txt"));

                session = await this.analyzer.AnalyzeAsync(navigationProvider, new AnalyzerOptions()
                {
                    Depth = AnalyzeDepth.All
                });

                session.CreatedDocumentsCount.Should().Be(1);
                session.UpdatedDocumentsCount.Should().Be(1);
                session.DeletedDocumentsCount.Should().Be(1);

                Assert.AreEqual(initialVersesCount + 3, await DbContext.VerseEntryRepository.CountAsync());
            }
            finally
            {
                await DbContext.VerseRelationRepository.DeleteAsync(
                    v => v.DocumentParagraph.Document.Folder.NavigationProviderId == navigationProviderInfo.Id);

                await DbContext.VerseEntryRepository.DeleteAsync(
                    v => v.DocumentParagraph.Document.Folder.NavigationProviderId == navigationProviderInfo.Id);

                await DbContext.DocumentParagraphRepository.DeleteAsync(
                    p => p.Document.Folder.NavigationProviderId == navigationProviderInfo.Id);

                await DbContext.DocumentRepository.DeleteAsync(
                    d => d.Folder.NavigationProviderId == navigationProviderInfo.Id);

                await DbContext.DocumentFolderRepository.DeleteAsync(
                    f => f.NavigationProviderId == navigationProviderInfo.Id);

                await DbContext.AnalysisSessions.DeleteAsync(
                    s => s.NavigationProviderId == navigationProviderInfo.Id);

                await DbContext.NavigationProvidersInfo.DeleteAsync(
                    p => p.Id == navigationProviderInfo.Id);
            }
        }
    }
}

