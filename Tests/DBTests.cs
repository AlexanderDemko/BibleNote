using BibleNote.Analytics.Domain.Entities;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using System.Linq;
using Microsoft.EntityFrameworkCore;
using BibleNote.Tests.Analytics.TestsBase;

namespace BibleNote.Tests.Analytics
{
    [TestClass]
    public class DbTests : DbTestsBase
    {
        [TestInitialize]
        public void Init()
        {
            base.Init();        
        }
        
        [TestCleanup]
        public override void Cleanup()
        {
            base.Cleanup();
        }

        [TestMethod]        
        public void TestCreateAndDeleteFolder()
        {
            var foldersCount = 0;
            var testFolderName = "Test1";

            foldersCount = this.AnalyticsContext.DocumentFolderRepository.Count();

            var newFolder = new DocumentFolder() { Name = testFolderName, NavigationProviderName = "Html", Path = "c:\temp" };
            this.AnalyticsContext.DocumentFolderRepository.ToTrackingRepository().Add(newFolder);
            this.AnalyticsContext.SaveChangesAsync();

            this.ConcreteContext.Entry(newFolder).State = EntityState.Detached;

            Assert.AreEqual(foldersCount + 1, this.AnalyticsContext.DocumentFolderRepository.Count());
            var folder = this.AnalyticsContext.DocumentFolderRepository.FirstOrDefault(f => f.Name == testFolderName);
            Assert.IsNotNull(folder);
            this.AnalyticsContext.DocumentFolderRepository.ToTrackingRepository().Delete(folder);
            this.AnalyticsContext.SaveChangesAsync();

            Assert.AreEqual(foldersCount, this.AnalyticsContext.DocumentFolderRepository.Count());
            Assert.IsNull(this.AnalyticsContext.DocumentFolderRepository.FirstOrDefault(f => f.Name == testFolderName));
        }
    }
}
