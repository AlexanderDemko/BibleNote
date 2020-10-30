using System;
using System.Threading.Tasks;
using BibleNote.Domain.Contracts;
using BibleNote.Domain.Entities;
using BibleNote.Persistence;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace BibleNote.Tests.TestsBase
{
    public class DbTestsBase : TestsBase
    {
        protected ITrackingDbContext AnalyticsContext { get; set; }
        protected AnalyticsDbContext ConcreteContext { get; set; }

        private SqliteConnection connection;
        
        public override void Init(Action<IServiceCollection> registerServicesAction = null)
        {
            this.connection = new SqliteConnection(
                @"DataSource=..\..\..\..\Persistence\BibleNote.Analytics.db"
                //"DataSource=:memory:"
                );
            connection.Open();

            base.Init(options =>
            {
                options.AddDbContext<ITrackingDbContext, AnalyticsDbContext>(opt => opt.UseSqlite(connection));
                registerServicesAction?.Invoke(options);
            });

            this.AnalyticsContext = ServiceProvider.GetService<ITrackingDbContext>();
            this.ConcreteContext = (AnalyticsDbContext)this.AnalyticsContext;
            this.ConcreteContext.Database.Migrate();            
            DbInitializer.Initialize(this.ConcreteContext);            
        }        
        
        public virtual void Cleanup()
        {
            this.connection?.Close();
        }

        protected async Task<Document> GetOrCreateDocument()
        {
            var navProvider = await this.AnalyticsContext.NavigationProvidersInfo.FirstOrDefaultAsync();
            if (navProvider == null)
            {
                navProvider = new NavigationProviderInfo() { Name = "Test", FullTypeName = "test", ParametersRaw = "test" };
                this.AnalyticsContext.NavigationProvidersInfo.Add(navProvider);
                await this.AnalyticsContext.SaveChangesAsync();
            }

            var document = await this.AnalyticsContext.DocumentRepository.FirstOrDefaultAsync();
            if (document == null)
            {
                var folder = new DocumentFolder() { Name = "Temp", Path = "Test", NavigationProviderId = navProvider.Id };
                document = new Document() { Name = "Temp", Path = "Test", Folder = folder };
                this.AnalyticsContext.DocumentRepository.Add(document);
                await this.AnalyticsContext.SaveChangesAsync();
            }

            return document;
        }
    }
}
