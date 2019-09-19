using BibleNote.Analytics.Domain.Contracts;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using BibleNote.Analytics.Persistence;
using System;

namespace BibleNote.Tests.Analytics.TestsBase
{
    public class DbTestsBase : TestsBase
    {
        protected ITrackingDbContext AnalyticsContext { get; set; }
        protected AnalyticsDbContext ConcreteContext { get; set; }

        private SqliteConnection connection;
        
        public override void Init(Action<IServiceCollection> registerServicesAction = null)
        {
            this.connection = new SqliteConnection(
                @"DataSource=..\..\..\..\Analytics\Persistence\BibleNote.Analytics.db"
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
    }
}
