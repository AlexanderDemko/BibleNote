using BibleNote.Infrastructure.SingleInstance;
using System;
using System.IO;
using System.IO.Pipes;
using System.Text;

namespace BibleNote.Infrastructure.SingleInstance
{
    public class Subscriber
    {
        private readonly string applicationId;

        public event EventHandler<Data> ReceivedData;

        public Subscriber(string applicationId)
        {
            this.applicationId = applicationId;
        }

        public void StartListening()
        {
            using var server = new NamedPipeServerStream(applicationId);
            server.WaitForConnection();
            
            using var reader = new BinaryReader(server, Encoding.UTF8);
            var argsCount = reader.ReadInt32();
            var args = new string[argsCount];
            for (int i = 0; i < argsCount; i++)
            {
                args[i] = reader.ReadString();
            }
            
            ReceivedData?.Invoke(this, new Data { Arguments = args });
            
            server.Close();         
            StartListening();     // listen to another publisher
        }
    }
}
