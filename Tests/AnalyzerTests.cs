using BibleNote.Domain.Entities;
using BibleNote.Domain.Enums;
using BibleNote.Providers.FileSystem.Navigation;
using BibleNote.Services.DocumentProvider.Contracts;
using BibleNote.Services.DocumentProvider.Models;
using BibleNote.Tests.TestsBase;
using FluentAssertions;
using MediatR;
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
        private IMediator mediator;

        [TestInitialize]
        public void Init()
        {
            base.Init();

            this.analyzer = ServiceProvider.GetService<IAnalyzer>();
            this.mediator = ServiceProvider.GetService<IMediator>();
        }

        [TestCleanup]
        public override void Cleanup()
        {
            base.Cleanup();
        }

        [TestMethod]
        public async Task Test1()
        {
            await RunTestAsync(async (testFolder, testSubFolder, navigationProvider) =>
            {
                var initialVersesCount = await DbContext.VerseEntryRepository.CountAsync();

                await File.WriteAllTextAsync(Path.Combine(testFolder, "1.txt"), "Test file 1. Ин 1:1");
                await File.WriteAllTextAsync(Path.Combine(testFolder, "2.txt"), "Test file 2. Ин 1:2");
                await File.WriteAllTextAsync(Path.Combine(testSubFolder, "3.txt"), "Test file 3. Ин 2:2");

                var session = await this.analyzer.AnalyzeAsync(navigationProvider, new AnalyzerOptions()
                {
                    Depth = AnalyzeDepth.All
                });

                session.CreatedDocumentsCount.Should().Be(3);
                session.UpdatedDocumentsCount.Should().Be(0);
                session.DeletedDocumentsCount.Should().Be(0);

                Assert.AreEqual(initialVersesCount + 3, await DbContext.VerseEntryRepository.CountAsync());

                await File.WriteAllTextAsync(Path.Combine(testFolder, "1.txt"), "Test file 1 new. Ин 3:3");
                await File.WriteAllTextAsync(Path.Combine(testFolder, "4.txt"), "Test file 4 new. Ин 4:4");
                File.Delete(Path.Combine(testSubFolder, "3.txt"));

                session = await this.analyzer.AnalyzeAsync(navigationProvider, new AnalyzerOptions()
                {
                    Depth = AnalyzeDepth.All
                });

                session.CreatedDocumentsCount.Should().Be(1);
                session.UpdatedDocumentsCount.Should().Be(1);
                session.DeletedDocumentsCount.Should().Be(1);

                Assert.AreEqual(initialVersesCount + 3, await DbContext.VerseEntryRepository.CountAsync());
            });
        }

        private async Task RunTestAsync(Func<string, string, FileNavigationProvider, Task> testAction)
        {
            var testFolder = Path.Combine("c:\\temp", Guid.NewGuid().ToString());
            var testSubFolder = Path.Combine(testFolder, "testSubFolder", "testSubSubFolder");
            Directory.CreateDirectory(testSubFolder);

            var navigationProviderInfo = new NavigationProviderInfo()
            {
                Name = "Test file provider",
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

                await testAction(testFolder, testSubFolder, navigationProvider);
            }
            finally
            {
                await this.mediator.Send(new Middleware.NavigationProviders.Commands.Delete.Request(navigationProviderInfo.Id));
            }
        }
    }
}

