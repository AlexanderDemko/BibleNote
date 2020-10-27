using System;
using BibleNote.Domain.Contracts;
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
    }
}
