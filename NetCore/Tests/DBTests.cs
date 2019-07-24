using BibleNote.Analytics.Data.Contracts;
using BibleNote.Analytics.Data.Entities;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Microsoft.Extensions.DependencyInjection;
using System.Linq;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using BibleNote.Analytics.Persistence;

namespace BibleNote.Tests.Analytics
{
    [TestClass]
    public class DBTests : TestsBase.TestsBase
    {
        private IDbContext analyticsContext;
        private AnalyticsContext concreteContext;
        private SqliteConnection connection;

        [TestInitialize]
        public void Init()
        {
            this.connection = new SqliteConnection(
                //@"DataSource=..\..\..\..\Analytics\Persistence\BibleNote.Analytics.db"
                "DataSource=:memory:"
                );
            connection.Open();

            base.Init(options =>
                options.AddDbContext<IDbContext, AnalyticsContext>(opt => opt.UseSqlite(connection)));

            this.analyticsContext = ServiceProvider.GetService<IDbContext>();
            this.concreteContext = (AnalyticsContext)this.analyticsContext;
            this.concreteContext.Database.Migrate();            
            DbInitializer.Initialize(this.concreteContext);            
        }
        
        [TestCleanup]
        public void Cleanup()
        {
            this.connection.Close();
        }

        [TestMethod]        
        public void TestCreateAndDeleteFolder()
        {
            var foldersCount = 0;
            var testFolderName = "Test1";

            foldersCount = this.analyticsContext.DocumentFolderRepository.Count();

            var newFolder = new DocumentFolder() { Name = testFolderName, NavigationProviderName = "Html", Path = "c:\temp" };
            this.analyticsContext.DocumentFolderRepository.ToTrackingRepository().Add(newFolder);
            this.analyticsContext.SaveChangesAsync();

            this.concreteContext.Entry(newFolder).State = EntityState.Detached;

            Assert.AreEqual(foldersCount + 1, this.analyticsContext.DocumentFolderRepository.Count());
            var folder = this.analyticsContext.DocumentFolderRepository.FirstOrDefault(f => f.Name == testFolderName);
            Assert.IsNotNull(folder);
            this.analyticsContext.DocumentFolderRepository.ToTrackingRepository().Delete(folder);
            this.analyticsContext.SaveChangesAsync();

            Assert.AreEqual(foldersCount, this.analyticsContext.DocumentFolderRepository.Count());
            Assert.IsNull(this.analyticsContext.DocumentFolderRepository.FirstOrDefault(f => f.Name == testFolderName));
        }
    }
}
