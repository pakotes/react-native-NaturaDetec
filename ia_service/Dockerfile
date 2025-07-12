FROM python:3.10-slim

# Dependências do sistema necessárias para face_recognition
RUN apt-get update && \
    apt-get install -y build-essential cmake libopenblas-dev liblapack-dev \
    libx11-dev libgtk-3-dev libboost-python-dev libboost-thread-dev \
    libboost-system-dev libboost-filesystem-dev libboost-regex-dev \
    libjpeg-dev libpng-dev libtiff-dev libavcodec-dev libavformat-dev \
    libswscale-dev libv4l-dev libxvidcore-dev libx264-dev libatlas-base-dev \
    libhdf5-dev libprotobuf-dev protobuf-compiler libgoogle-glog-dev \
    libgflags-dev libgphoto2-dev libeigen3-dev libhdf5-serial-dev \
    python3-opencv && \
    rm -rf /var/lib/apt/lists/*

# Copia os arquivos do projeto
WORKDIR /app
COPY . /app

# Instala as dependências Python
RUN pip install --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

# Expõe a porta do FastAPI
EXPOSE 8000

# Comando para iniciar o servidor
CMD ["uvicorn", "main:socket_app", "--host", "0.0.0.0", "--port", "8000"]