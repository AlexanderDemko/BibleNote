using System;
using System.Threading.Tasks;
using BibleNote.Domain.Contracts;
using BibleNote.Domain.Entities;
using BibleNote.Domain.Enums;
using BibleNote.Persistence;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace BibleNote.Tests.TestsBase
{
#pragma warning disable CA1063 // Implement IDisposable Correctly
    public class DbTestsBase : TestsBase, IDisposable
#pragma warning restore CA1063 // Implement IDisposable Correctly
    {
        protected ITrackingDbContext DbContext { get; set; }
        protected AnalyticsDbContext ConcreteContext { get; set; }

        private SqliteConnection connection;
        private string dbFilePath;
        
        public override void Init(Action<IServiceCollection> registerServicesAction = null)
        {
            this.dbFilePath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "BibleNote.Tests", $"{Guid.NewGuid():N}.db");
            System.IO.Directory.CreateDirectory(System.IO.Path.GetDirectoryName(this.dbFilePath));
            this.connection = new SqliteConnection($"DataSource={this.dbFilePath}");
            connection.Open();

            base.Init(services =>
            {
                services.AddDbContext<ITrackingDbContext, AnalyticsDbContext>(opt => opt.UseSqlite(connection));
                registerServicesAction?.Invoke(services);
            });

            this.DbContext = ServiceProvider.GetService<ITrackingDbContext>();
            this.ConcreteContext = (AnalyticsDbContext)this.DbContext;
            this.ConcreteContext.Database.Migrate();
            DbInitializer.InitializeAsync(this.ConcreteContext).GetAwaiter().GetResult();
        }        
                
        public virtual void Cleanup()
        {
            this.connection?.Close();
            DeleteTestDatabaseFile();
        }

        protected async Task<Document> GetOrCreateDocument()
        {
            var navProvider = await this.DbContext.NavigationProvidersInfo.FirstOrDefaultAsync();
            if (navProvider == null)
            {
                navProvider = new NavigationProviderInfo() { Name = "Test", Type = NavigationProviderType.File, ParametersRaw = "test" };
                this.DbContext.NavigationProvidersInfo.Add(navProvider);
                await this.DbContext.SaveChangesAsync();
            }

            var document = await this.DbContext.DocumentRepository.FirstOrDefaultAsync();
            if (document == null)
            {
                var folder = new DocumentFolder() { Name = "Temp", Path = "Test", NavigationProviderId = navProvider.Id };
                document = new Document() { Name = "Temp", Path = "Test", Folder = folder };
                this.DbContext.DocumentRepository.Add(document);
                await this.DbContext.SaveChangesAsync();
            }

            return document;
        }

        public void Dispose()
        {
            this.connection?.Dispose();
            DeleteTestDatabaseFile();
        }

        private void DeleteTestDatabaseFile()
        {
            if (string.IsNullOrEmpty(this.dbFilePath) || !System.IO.File.Exists(this.dbFilePath))
                return;

            try
            {
                System.IO.File.Delete(this.dbFilePath);
            }
            catch
            {
            }
        }
    }
}
