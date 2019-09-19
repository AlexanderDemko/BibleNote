using BibleNote.Analytics.Domain.Entities;
using BibleNote.Analytics.Providers.FileSystem.DocumentId;
using BibleNote.Analytics.Providers.FileSystem.Navigation;
using BibleNote.Analytics.Providers.Html;
using BibleNote.Analytics.Providers.Html.Contracts;
using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using BibleNote.Analytics.Services.DocumentProvider.Models;
using BibleNote.Analytics.Services.VerseProcessing.Contracts;
using BibleNote.Tests.Analytics.TestsBase;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using System.Linq;
using System.Threading.Tasks;

namespace BibleNote.Tests.Analytics
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
        public void Test1()
        {
            var navigationProvider = ActivatorUtilities.CreateInstance<FileNavigationProvider>(ServiceProvider);
            navigationProvider.FolderPath = @"C:\temp\testData";
            this.analyzer.Analyze(navigationProvider, new AnalyzerOptions()
            {
                Depth = AnalyzeDepth.All
            }).Wait();
        }
    }
}

