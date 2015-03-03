using BibleNote.Core.DBModel;
using BibleNote.Core.Services;
using System;
using System.Collections.Generic;
using System.Data.EntityClient;
using System.Data.SqlClient;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace BibleNote.Core.Helpers
{
    public class DBHelper
    {
        public static IndexModel GetIndexModel()
        {
            var entityStringBuilder = new EntityConnectionStringBuilder();
            entityStringBuilder.ProviderConnectionString = @"Data Source=" + ConfigurationManager.Instance.DBIndexPath;
            entityStringBuilder.Provider = "System.Data.SqlServerCe.4.0";
            entityStringBuilder.Metadata = "res://*/DBModel.IndexModel.csdl|res://*/DBModel.IndexModel.ssdl|res://*/DBModel.IndexModel.msl";

            return new IndexModel(entityStringBuilder.ConnectionString);
        }
    }
}
