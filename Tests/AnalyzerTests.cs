using BibleNote.Analytics.Providers.FileSystem.Navigation;
using BibleNote.Analytics.Services.DocumentProvider.Contracts;
using BibleNote.Analytics.Services.DocumentProvider.Models;
using BibleNote.Tests.Analytics.TestsBase;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;

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
            navigationProvider.FolderPath = @"C:\prj\BibleNote\Tests\TestData";
            this.analyzer.Analyze(navigationProvider, new AnalyzerOptions()
            {
                Depth = AnalyzeDepth.All
            }).Wait();
        }
    }
}

